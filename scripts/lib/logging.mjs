export function createLogger(scope, options = {}) {
  const quiet = Boolean(options.quiet);

  const emit = (level, message) => {
    if (quiet && level !== "warn" && level !== "error") {
      return;
    }
    console.error(`${new Date().toISOString()} [${scope}] ${level}: ${message}`);
  };

  return {
    info(message) {
      emit("info", message);
    },
    warn(message) {
      emit("warn", message);
    },
    error(message) {
      emit("error", message);
    }
  };
}
