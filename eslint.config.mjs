// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["web-build/", "e2e/", "android/", "ios/", "dist/", ".expo/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // Images and other assets are loaded with require() in React Native
      "@typescript-eslint/no-require-imports": "off",
      "@stylistic/member-delimiter-style": ["error", {
        "multiline": {
          "delimiter": "semi",
          "requireLast": true,
        },
        "singleline": {
          "delimiter": "comma",
          "requireLast": false,
        },
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        "vars": "all",
        "args": "all",
        "ignoreRestSiblings": true,
        "argsIgnorePattern": "^_",
        "caughtErrors": "none",
      }],

      "react/display-name": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "@stylistic/jsx-tag-spacing": ["error", {
        "closingSlash": "never",
        "beforeSelfClosing": "always",
        "afterOpening": "never",
        "beforeClosing": "never",
      }],
      "react/jsx-boolean-value": ["error", "never"],
      "@stylistic/jsx-curly-spacing": ["error", { "when": "never", "children": true }],
      "@stylistic/jsx-equals-spacing": ["error", "never"],
      "@stylistic/jsx-indent-props": ["error", 2],
      "react/jsx-curly-brace-presence": ["error", "never"],
      "react/jsx-key": ["error", { "checkFragmentShorthand": true }],
      "react/void-dom-elements-no-children": ["error"],
      "react/no-unknown-property": ["error"],

      "@stylistic/quotes": ["error", "double", { "allowTemplateLiterals": "always", "avoidEscape": true }],
      "@stylistic/semi": ["error", "always", { "omitLastInOneLineBlock": true }],
      "@stylistic/comma-dangle": ["error", {
        "arrays": "always-multiline",
        "objects": "always-multiline",
        "imports": "always-multiline",
        "exports": "always-multiline",
        "functions": "never",
        "enums": "always-multiline",
        "tuples": "always-multiline",
        "generics": "ignore",
      }],
      "@stylistic/comma-spacing": ["error"],
      "eqeqeq": ["error", "smart"],
      "@stylistic/indent": ["error", 2, {
        "SwitchCase": 1,
      }],
      "@stylistic/no-multi-spaces": "error",
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/arrow-parens": "error",
      "@stylistic/arrow-spacing": "error",
      "@stylistic/key-spacing": "error",
      "@stylistic/keyword-spacing": "error",
      "@stylistic/function-call-spacing": ["error"],
      "@stylistic/space-before-function-paren": ["error", {
        "anonymous": "always",
        "named": "never",
        "asyncArrow": "always",
      }],
      "@stylistic/space-in-parens": ["error", "never"],
      "@stylistic/space-before-blocks": "error",
      "curly": ["error", "all"],
      "@stylistic/space-infix-ops": "error",
      "consistent-return": "error",
      "@stylistic/jsx-quotes": ["error"],
      "@stylistic/array-bracket-spacing": "error",
      "@stylistic/brace-style": [
        "error",
        "1tbs",
        { allowSingleLine: true },
      ],
      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "warn",
    },
  }
);
