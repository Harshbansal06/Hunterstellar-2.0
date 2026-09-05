/**
 * In-memory stand-in for the Supabase client.
 *
 * The builder is uniform: every filter/modifier returns the same object, and
 * the query is only evaluated when it is awaited (`then`/`single`/`maybeSingle`).
 * Evaluating late is what makes conditional updates behave like Postgres --
 * `update().eq("id").eq("stage").eq("progress")` re-reads the live table at
 * await time, so a losing racer sees the winner's write and matches 0 rows.
 */
function createMockSupabase() {
  const tables = new Map();
  const rpcHandlers = new Map();
  const callLog = [];
  // Simulated round-trip delay, in ms, per table. Real Postgres calls take
  // time, and that gap between read and write is what makes a lost update
  // possible; without it every request here would resolve start-to-finish
  // before the next one begins and no race could ever be observed.
  const latency = new Map();

  const clone = (row) => JSON.parse(JSON.stringify(row));
  const rowsOf = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  function reset() {
    tables.clear();
    rpcHandlers.clear();
    callLog.length = 0;
    latency.clear();
  }

  function setLatency(name, ms) {
    latency.set(name, ms);
  }

  // Waits out the table's simulated round trip and only then evaluates the
  // query. Evaluation itself stays synchronous, so a statement is still atomic
  // once it begins -- just as in Postgres, it is the wait before it that lets
  // another request slip in.
  function settle(tableName, evaluate) {
    const ms = latency.get(tableName) || 0;
    if (!ms) return Promise.resolve(evaluate());
    return new Promise((resolve) => setTimeout(() => resolve(evaluate()), ms));
  }

  function setTable(name, rows) {
    tables.set(name, rows.map(clone));
  }

  function setRpc(name, handler) {
    rpcHandlers.set(name, handler);
  }

  function logCall(method, table, args) {
    callLog.push({ method, table, args: clone(args), ts: Date.now() });
  }

  const NO_ROWS = { message: "No rows found", code: "PGRST116" };

  function createQueryBuilder(tableName) {
    let op = "select";
    let payload = null;
    const filters = [];
    let orderBy = null;
    let limitCount = null;
    let returning = false;

    function matches(row) {
      return filters.every((f) => row[f.col] === f.val);
    }

    // Runs the query against the live table. Synchronous on purpose: an
    // awaited builder resolves in one uninterrupted tick, so a read-modify-write
    // cannot interleave with another request's write.
    function execute() {
      const table = rowsOf(tableName);

      if (op === "insert") {
        const row = {
          ...payload,
          id:
            payload.id || `mock-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        table.push(row);
        return { data: clone(row), error: null, rows: [clone(row)] };
      }

      if (op === "update") {
        const hit = table.filter(matches);
        hit.forEach((row) => Object.assign(row, payload));
        const data = hit.map(clone);
        return { data, error: null, rows: data };
      }

      if (op === "delete") {
        const kept = table.filter((row) => !matches(row));
        const removed = table.length - kept.length;
        tables.set(tableName, kept);
        return { data: null, error: null, rows: [], removed };
      }

      let rows = table.filter(matches).map(clone);
      if (orderBy) {
        const { col, ascending } = orderBy;
        rows.sort((a, b) => {
          if (a[col] < b[col]) return ascending ? -1 : 1;
          if (a[col] > b[col]) return ascending ? 1 : -1;
          return 0;
        });
      }
      if (limitCount !== null) rows = rows.slice(0, limitCount);
      return { data: rows, error: null, rows };
    }

    const qb = {
      select(columns = "*") {
        logCall(op === "select" ? "select" : `${op}.select`, tableName, { columns });
        returning = true;
        return qb;
      },
      insert(data) {
        op = "insert";
        payload = Array.isArray(data) ? data[0] : data;
        logCall("insert", tableName, { data: payload });
        return qb;
      },
      update(data) {
        op = "update";
        payload = data;
        logCall("update", tableName, { data });
        return qb;
      },
      delete() {
        op = "delete";
        logCall("delete", tableName, {});
        return qb;
      },
      eq(col, val) {
        logCall(`${op}.eq`, tableName, { col, val });
        filters.push({ col, val });
        return qb;
      },
      order(col, { ascending } = {}) {
        logCall("order", tableName, { col, ascending });
        orderBy = { col, ascending };
        return qb;
      },
      limit(n) {
        logCall("limit", tableName, { n });
        limitCount = n;
        return qb;
      },
      single() {
        logCall("single", tableName, {});
        return settle(tableName, () => {
          const { rows, error } = execute();
          if (error) return { data: null, error };
          return rows.length
            ? { data: rows[0], error: null }
            : { data: null, error: NO_ROWS };
        });
      },
      maybeSingle() {
        logCall("maybeSingle", tableName, {});
        return settle(tableName, () => {
          const { rows, error } = execute();
          if (error) return { data: null, error };
          return { data: rows.length ? rows[0] : null, error: null };
        });
      },
      then(resolve, reject) {
        return settle(tableName, () => {
          const { data, error } = execute();
          // A bare `insert`/`update` without `.select()` returns no rows,
          // matching PostgREST's default minimal representation.
          if (!returning && (op === "insert" || op === "update")) {
            return { data: null, error };
          }
          return { data, error };
        }).then(resolve, reject);
      },
    };

    return qb;
  }

  return {
    from(table) {
      return createQueryBuilder(table);
    },
    rpc(name, params) {
      logCall("rpc", name, { params });
      const handler = rpcHandlers.get(name);
      if (handler) return Promise.resolve(handler(params));
      return Promise.resolve({
        data: null,
        error: { message: `RPC ${name} not mocked`, code: "42883" },
      });
    },
    __testing: {
      reset,
      setTable,
      setRpc,
      setLatency,
      getCallLog: () => callLog.map((c) => ({ ...c })),
      getTable: (name) => (tables.get(name) || []).map(clone),
    },
  };
}

module.exports = { createMockSupabase };
