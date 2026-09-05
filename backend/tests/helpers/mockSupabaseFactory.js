const { createMockSupabase } = require("./mockSupabase");

module.exports = function createMockSupabaseFactory() {
  return createMockSupabase();
};
