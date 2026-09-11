import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  /**
   * Licence guard.
   *
   * Form King data may only reach the app through src/lib/model/publish.ts.
   * Importing it anywhere else risks putting their ratings, sectionals or form
   * history in front of subscribers, which the API terms prohibit outright.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/formking/**",
      "src/lib/model/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/formking", "@/lib/formking/*", "**/formking/*"],
              message:
                "Form King data is licensed and must not be exposed. Route it through src/lib/model/publish.ts, which emits only publishable fields.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
