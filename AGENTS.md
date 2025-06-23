```markdown
# AGENTS.md - Guidelines for Quackbot Development

This document provides guidelines and information for AI agents (and human developers) working on the Quackbot codebase.

## 1. Project Overview

Quackbot is a Node.js application written in TypeScript. Its primary function is to:
1.  Download the latest videos from a specified YouTube channel (e.g., TechLinked).
2.  Identify and extract a specific segment called "Quick Bits" from these videos.
3.  Upload these extracted clips to multiple platforms, currently YouTube (as Shorts) and X (formerly Twitter).
4.  Track processed videos in an SQLite database to avoid redundant work.
5.  Run periodically using a cron job.

## 2. Development Environment Setup

### Prerequisites:
-   Node.js (check `package.json` for engine specifics if any, though not explicitly defined)
-   npm (comes with Node.js)
-   FFmpeg: Must be installed and accessible in the system PATH, as `fluent-ffmpeg` relies on it.
-   Access to YouTube Data API v3 credentials.
-   Access to X API v1.1 and v2 credentials.

### Initial Setup:
1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the root directory. Refer to `README.md` for the list of required environment variables. These include API keys and tokens for YouTube and X.
    -   To get `YOUTUBE_TOKENS`, run:
        ```bash
        npm run get-youtube-tokens
        ```
        This script will guide you through an OAuth flow.
4.  **Database:**
    The application uses an SQLite database (`videos.db`). It will be created automatically in the root directory when the application first runs or `initDb()` is called.

## 3. Running the Application

-   **Main application:**
    The application is designed to be run via `src/index.ts`. After building, it can be started with `node dist/index.js`.
    ```bash
    npm run build
    node dist/index.js
    ```
-   **Docker:**
    Refer to `README.md` and `Dockerfile` for instructions on building and running the application in a Docker container. Ensure all necessary environment variables are passed to the Docker container.

## 4. Testing

-   **Test Runner:** [Vitest](https://vitest.dev/) is used for unit and integration tests.
-   **Running Tests:**
    ```bash
    npm test
    ```
    This command will run all tests and generate a coverage report (output to the `coverage/` directory).
-   **Test File Location:** Test files (`*.test.ts`) are co-located with their corresponding source files in the `src/` directory.
-   **Writing Tests:**
    -   New features or bug fixes should ideally be accompanied by tests.
    -   Ensure tests cover an adequate range of scenarios, including success cases, edge cases, and error conditions.
    -   Mock external dependencies (like API calls, `ffmpeg` execution, or database interactions where appropriate) to ensure tests are reliable and fast.

## 5. Coding Conventions and Style

-   **Language:** TypeScript. Adhere to strong typing and leverage TypeScript features for robust code.
-   **Modules:** Use ES Module syntax (`import`/`export`).
-   **Formatting:** [Prettier](https://prettier.io/) is used for code formatting. Code should be formatted with Prettier before committing. The configuration is in `.prettierrc`.
    ```bash
    npx prettier --write .
    ```
-   **Naming Conventions:**
    -   `camelCase` for variables and functions (e.g., `myVariable`, `calculateValue`).
    -   `PascalCase` for classes, types, and interfaces (e.g., `MyClass`, `VideoClip`).
    -   `UPPER_CASE_SNAKE_CASE` for constants (e.g., `MAX_RETRIES`).
    -   `kebab-case` for filenames (e.g., `my-module.ts`, `api-client.ts`).
-   **Comments:**
    -   Use JSDoc-style comments for functions, classes, and complex logic to explain purpose, parameters, and return values.
    -   Use inline comments for clarifying specific, non-obvious lines of code.
-   **Error Handling:**
    -   Use `try...catch` blocks for operations that might fail (I/O, API calls).
    -   Reject Promises with `Error` objects.
    -   Provide meaningful error messages.
    -   Log errors appropriately (e.g., using `console.error` or a dedicated logger if introduced).
-   **Asynchronous Code:** Use `async/await` for cleaner asynchronous operations.
-   **Strict Mode:** TypeScript is configured with `"strict": true`. Ensure code adheres to these strict type-checking rules.

## 6. Project Structure

-   `src/`: Contains all TypeScript source code.
    -   `index.ts`: Main application entry point and cron job setup.
    -   `db.ts`: SQLite database interactions (tracking uploads, errors).
    -   `youtube-api.ts`: Interactions with YouTube API (fetching video lists, details, chapters) and `youtube-dl-exec` for downloads.
    -   `extract-quick-bits.ts`: Logic for finding "Quick Bits" chapters and using `ffmpeg` to extract them.
    -   `has-sound.ts`: Utility to check if video files contain audible sound.
    -   `upload-to-platforms.ts`: Orchestrates uploads to all configured platforms.
    -   `upload-to-youtube.ts`: YouTube-specific upload logic.
    -   `upload-to-twitter.ts`: X (Twitter)-specific upload logic.
    -   `types.ts`: Common TypeScript type definitions.
    -   `*.test.ts`: Test files.
-   `scripts/`: Utility scripts (e.g., `get-youtube-tokens.mjs`).
-   `videos/`: Temporary directory for downloaded and processed video files. *(Consider adding this to `.gitignore` if files are purely transient).*
-   `dist/`: Output directory for compiled JavaScript code (from `tsc`). This *is* in `.gitignore`.
-   `.env`: Local environment variable configuration (should be in `.gitignore`).
-   `Dockerfile`: For building the Docker image.
-   `AGENTS.md`: This file.

## 7. Key Dependencies and Technologies

-   **Node.js:** Runtime environment.
-   **TypeScript:** Programming language.
-   **Axios:** HTTP client for API requests.
-   **`fluent-ffmpeg`:** Wrapper around FFmpeg for video processing.
-   **`googleapis`:** Google API client (for YouTube).
-   **`twitter-api-v2`:** X (Twitter) API client.
-   **`youtube-dl-exec`:** Wrapper for `yt-dlp` (or `youtube-dl`) for downloading videos.
-   **SQLite (`sqlite`, `sqlite3`):** Database for persistence.
-   **`node-cron`:** For scheduling tasks.
-   **`he`:** HTML entity decoder.
-   **Vitest:** Testing framework.
-   **Prettier:** Code formatter.

## 8. Workflow for Adding Features / Fixing Bugs

1.  **Understand the requirement or bug.**
2.  **Create a new branch** for your changes (e.g., `feature/new-platform` or `fix/database-error-logging`).
3.  **Write or update tests** that cover the changes. Tests should fail before implementing the code.
4.  **Implement the code changes.**
5.  **Run tests (`npm test`)** to ensure all tests pass, including new ones.
6.  **Verify test coverage.** Aim to maintain or improve it.
7.  **Format your code:** `npx prettier --write .`
8.  **Lint your code** (if a linter is added in the future).
9.  **Commit your changes** with a clear and descriptive commit message.
10. **Push your branch and create a Pull Request** (if applicable in the development workflow).

## 9. Important Notes & Known Issues

-   **FFmpeg Dependency:** Ensure FFmpeg is installed and in PATH. The application will fail if it cannot find/execute `ffmpeg`.
-   **API Quotas:** Be mindful of API rate limits for YouTube and X. The application fetches latest videos hourly, which should generally be fine, but extensive testing or modifications might hit quotas.
-   **Error Logging in `db.ts`:** The `logUploadError` function in `src/db.ts` has a bug: it attempts to insert into the `upload_errors` table without providing a value for the `platform_id` column, which is defined as `NOT NULL`. This will cause the error logging itself to fail. This should be fixed.
-   **Temporary Video Files:** The `./videos/` directory is used for storing downloaded and processed clips. These files are deleted after successful processing of a video. However, if an error occurs mid-process, files might be left behind. This directory is not in `.gitignore`.

## 10. Programmatic Checks

When submitting changes, ensure the following commands run successfully:

1.  **Build the project:**
    ```bash
    npm run build
    ```
2.  **Run all tests (including coverage):**
    ```bash
    npm test
    ```
    Ensure all tests pass and there are no unexpected drops in coverage.

By following these guidelines, we can maintain a consistent, high-quality, and understandable codebase.
```
