(function () {
  "use strict";

  const CONFIG_KEY = "billsplit-turso-config";
  const PERSON_KEY = "billsplit-person-id";
  const ALLOWED_TABLES = new Set(["people", "bills", "recurring_bills", "history"]);

  function getConfig() {
    try {
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
      return config && config.url && config.token ? config : null;
    } catch (_) {
      return null;
    }
  }

  function saveConfig(url, token) {
    const config = { url: normalizeUrl(url), token: String(token || "").trim() };
    if (!config.url || !config.token) throw new Error("Enter both the database URL and token.");
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(PERSON_KEY);
  }

  function getPersonId() {
    return localStorage.getItem(PERSON_KEY);
  }

  function setPersonId(id) {
    if (id) localStorage.setItem(PERSON_KEY, id);
    else localStorage.removeItem(PERSON_KEY);
  }

  function normalizeUrl(value) {
    let url = String(value || "").trim().replace(/\/+$/, "");
    url = url.replace(/^(libsql|turso):\/\//i, "https://");
    url = url.replace(/\/v2\/pipeline$/i, "");
    if (url && !/^https:\/\//i.test(url)) url = "https://" + url;
    return url;
  }

  function sqlValue(value) {
    if (value === null || value === undefined) return { type: "null" };
    if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("A database value is not a finite number.");
      if (Number.isInteger(value)) return { type: "integer", value: String(value) };
      return { type: "float", value };
    }
    if (typeof value === "object") value = JSON.stringify(value);
    return { type: "text", value: String(value) };
  }

  function jsValue(value) {
    if (!value || value.type === "null") return null;
    if (value.type === "integer" || value.type === "float") return Number(value.value);
    if (value.type === "blob") return value.base64;
    return value.value;
  }

  function assertIdentifier(value) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("Invalid database identifier.");
    return value;
  }

  async function pipeline(statements, configOverride) {
    const config = configOverride || getConfig();
    if (!config) throw new Error("Turso is not configured on this device.");
    const requests = statements.map((statement) => ({
      type: "execute",
      stmt: {
        sql: statement.sql,
        args: (statement.args || []).map(sqlValue),
      },
    }));
    requests.push({ type: "close" });

    let response;
    try {
      response = await fetch(normalizeUrl(config.url) + "/v2/pipeline", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
        cache: "no-store",
      });
    } catch (error) {
      throw new Error("Could not reach Turso. Check the URL and your internet connection.");
    }

    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
      const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
      throw new Error(`Turso rejected the connection (${detail}).`);
    }

    const results = (payload?.results || []).slice(0, statements.length);
    if (results.length !== statements.length) throw new Error("Turso returned an incomplete response.");
    return results.map((entry) => {
      if (entry.type === "error") throw new Error(entry.error?.message || "Turso query failed.");
      const result = entry.response?.result || {};
      const columns = (result.cols || []).map((column) => column.name);
      const rows = (result.rows || []).map((row) =>
        Object.fromEntries(row.map((value, index) => [columns[index], jsValue(value)]))
      );
      return {
        rows,
        affectedRows: result.affected_row_count || 0,
        lastInsertRowid: result.last_insert_rowid ? Number(result.last_insert_rowid) : null,
      };
    });
  }

  async function execute(sql, args, configOverride) {
    return (await pipeline([{ sql, args }], configOverride))[0];
  }

  function decodeRows(table, rows) {
    return rows.map((row) => {
      if (table === "people") row.is_you = Boolean(row.is_you);
      if (table === "history") {
        for (const key of ["paid_summary", "bills_snapshot"]) {
          if (typeof row[key] === "string") {
            try { row[key] = JSON.parse(row[key]); } catch (_) {}
          }
        }
      }
      return row;
    });
  }

  class QueryBuilder {
    constructor(table) {
      if (!ALLOWED_TABLES.has(table)) throw new Error("Unknown application table.");
      this.table = table;
      this.operation = "select";
      this.values = null;
      this.filters = [];
      this.sort = null;
      this.promise = null;
    }
    select() { this.operation = "select"; return this; }
    insert(values) { this.operation = "insert"; this.values = Array.isArray(values) ? values : [values]; return this; }
    update(values) { this.operation = "update"; this.values = values; return this; }
    delete() { this.operation = "delete"; return this; }
    eq(column, value) { this.filters.push([assertIdentifier(column), "=", value]); return this; }
    gte(column, value) { this.filters.push([assertIdentifier(column), ">=", value]); return this; }
    lte(column, value) { this.filters.push([assertIdentifier(column), "<=", value]); return this; }
    order(column, options) { this.sort = [assertIdentifier(column), options?.ascending === false ? "DESC" : "ASC"]; return this; }
    then(resolve, reject) {
      if (!this.promise) this.promise = this.run();
      return this.promise.then(resolve, reject);
    }
    whereClause(args) {
      if (!this.filters.length) return "";
      this.filters.forEach((filter) => args.push(filter[2]));
      return " WHERE " + this.filters.map((filter) => `${filter[0]} ${filter[1]} ?`).join(" AND ");
    }
    async run() {
      try {
        if (this.operation === "select") {
          const args = [];
          let sql = `SELECT * FROM ${this.table}` + this.whereClause(args);
          if (this.sort) sql += ` ORDER BY ${this.sort[0]} ${this.sort[1]}`;
          const result = await execute(sql, args);
          return { data: decodeRows(this.table, result.rows), error: null };
        }

        if (this.operation === "insert") {
          const statements = this.values.map((original) => {
            const value = { ...original, id: original.id || crypto.randomUUID() };
            const columns = Object.keys(value).map(assertIdentifier);
            return {
              sql: `INSERT INTO ${this.table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
              args: columns.map((column) => value[column]),
            };
          });
          await pipeline(statements);
          return { data: this.values, error: null };
        }

        if (this.operation === "update") {
          if (!this.filters.length) throw new Error("Refusing to update without a filter.");
          const columns = Object.keys(this.values).map(assertIdentifier);
          const args = columns.map((column) => this.values[column]);
          const sql = `UPDATE ${this.table} SET ${columns.map((column) => `${column} = ?`).join(", ")}` + this.whereClause(args);
          await execute(sql, args);
          return { data: null, error: null };
        }

        if (this.operation === "delete") {
          const args = [];
          const where = this.whereClause(args);
          if (!where) throw new Error("Refusing to delete without a filter.");
          await execute(`DELETE FROM ${this.table}${where}`, args);
          return { data: null, error: null };
        }
      } catch (error) {
        console.error(error);
        return { data: null, error };
      }
    }
  }

  async function initializeSchema(configOverride) {
    const schema = [
      `CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL DEFAULT 'default', user_id TEXT,
        name TEXT NOT NULL, role TEXT DEFAULT '', note TEXT DEFAULT '', color_idx INTEGER NOT NULL DEFAULT 0,
        is_you INTEGER NOT NULL DEFAULT 0, annual_income REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS recurring_bills (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other', amount REAL NOT NULL, payer_person_id TEXT NOT NULL,
        split_pct REAL NOT NULL DEFAULT 50, split_method TEXT NOT NULL DEFAULT 'fixed', frequency TEXT NOT NULL DEFAULT 'monthly',
        day_of_month INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL DEFAULT 'default', date TEXT NOT NULL,
        month TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'other', amount REAL NOT NULL,
        payer_person_id TEXT NOT NULL, split_pct REAL NOT NULL DEFAULT 50,
        split_method TEXT NOT NULL DEFAULT 'fixed', recur_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL DEFAULT 'default', month_key TEXT NOT NULL,
        month_label TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
        paid_summary TEXT NOT NULL DEFAULT '{}', bills_snapshot TEXT NOT NULL DEFAULT '[]',
        settled_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS idx_bills_month ON bills(month)",
      "CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)",
      "CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at)",
    ].map((sql) => ({ sql, args: [] }));
    await pipeline(schema, configOverride);

    // Upgrade databases created by earlier BillSplit versions. SQLite does not
    // support ADD COLUMN IF NOT EXISTS, so inspect each table first.
    const upgrades = [
      ["people", "annual_income", "REAL"],
      ["bills", "split_method", "TEXT NOT NULL DEFAULT 'fixed'"],
      ["recurring_bills", "split_method", "TEXT NOT NULL DEFAULT 'fixed'"],
    ];
    for (const [table, column, definition] of upgrades) {
      const info = await execute(`PRAGMA table_info(${table})`, [], configOverride);
      if (!info.rows.some((row) => row.name === column)) {
        await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, [], configOverride);
      }
    }
  }

  window.BillSplitDB = {
    CONFIG_KEY,
    PERSON_KEY,
    getConfig,
    saveConfig,
    clearConfig,
    getPersonId,
    setPersonId,
    normalizeUrl,
    execute,
    pipeline,
    initializeSchema,
    from: (table) => new QueryBuilder(table),
  };
})();
