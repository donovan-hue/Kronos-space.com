import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "test-ui/**", "test/**"],
    linterOptions: { reportUnusedDisableDirectives: "off" }
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Toda llamada HTTP pasa por services/apiClient.js y sus servicios de
      // dominio; impide reintroducir instancias/configuraciones divergentes.
      "no-restricted-imports": ["error", {
        paths: [{ name: "axios", message: "Usa los servicios de dominio basados en apiClient." }]
      }]
    }
  },
  {
    files: ["src/services/apiClient.js"],
    rules: { "no-restricted-imports": "off" }
  }
];
