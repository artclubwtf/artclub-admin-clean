import "react-native-gesture-handler";

// Prevent devtools console monkey-patching crashes on Hermes.
try {
  if (typeof console !== "undefined") {
    Object.defineProperty(console, "error", {
      value: console.error,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(console, "warn", {
      value: console.warn,
      writable: true,
      configurable: true,
    });
  }
} catch {
  // ignore if console properties are non-configurable
}

const { registerRootComponent } = require("expo");
const App = require("./App").default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
