import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/no-deprecated": "error",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "warn",
      "react/jsx-no-bind": [
        "warn",
        { ignoreRefs: true, allowFunctions: true, allowArrowFunctions: true },
      ],
      "react/jsx-no-comment-textnodes": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
      "react/self-closing-comp": "error",
      "react/no-danger": "warn",
      "react/no-string-refs": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
        },
      ],

      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
    },
  },
  prettier,
  {
    rules: {
      "prettier/prettier": "warn",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "src/routeTree.gen.ts"],
  },
);
