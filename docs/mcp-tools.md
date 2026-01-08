# MCP Tools (Project)

Generated: 2026-01-08
Source: `codex mcp list --json` + runtime tool introspection

## Enabled servers
- auggie-mcp
- context7
- desktop-commander

## Tools
- auggie-mcp:codebase-retrieval — Semantic codebase retrieval for locating relevant files/symbols and project context.
- context7:resolve-library-id — Resolve a package/product name to a Context7-compatible library ID.
- context7:query-docs — Fetch up-to-date documentation and code examples for a library (use resolve-library-id first unless an exact ID is provided).
- desktop-commander:create_directory — Create a directory (including nested) within allowed paths.
- desktop-commander:edit_block — Apply targeted edits to text files or update Excel ranges.
- desktop-commander:force_terminate — Force terminate a running terminal session.
- desktop-commander:get_config — Show Desktop Commander server configuration.
- desktop-commander:get_file_info — Get file/directory metadata (size, times, sheets, etc.).
- desktop-commander:get_more_search_results — Paginate results from an active search session.
- desktop-commander:get_prompts — Retrieve and execute an onboarding prompt by ID.
- desktop-commander:get_recent_tool_calls — Show recent tool call history (in-memory).
- desktop-commander:get_usage_stats — Get tool usage statistics.
- desktop-commander:give_feedback_to_desktop_commander — Open the Desktop Commander feedback form.
- desktop-commander:interact_with_process — Send input to an interactive process (primary for local file/data analysis).
- desktop-commander:kill_process — Terminate a running process by PID.
- desktop-commander:list_directory — List directory contents with depth and overflow protection.
- desktop-commander:list_processes — List running processes with CPU/memory.
- desktop-commander:list_searches — List active searches.
- desktop-commander:list_sessions — List active terminal sessions.
- desktop-commander:move_file — Move/rename files or directories within allowed paths.
- desktop-commander:read_file — Read file/URL content (supports PDFs, images, Excel, pagination).
- desktop-commander:read_multiple_files — Read multiple files at once.
- desktop-commander:read_process_output — Read/paginate output from a running process.
- desktop-commander:set_config_value — Set a Desktop Commander configuration key/value.
- desktop-commander:start_process — Start a new terminal process (recommended for local analysis).
- desktop-commander:start_search — Start a background file/content search with streaming results.
- desktop-commander:stop_search — Stop an active search session.
- desktop-commander:write_file — Write/append file contents (chunked writing recommended).
- desktop-commander:write_pdf — Create/modify PDFs (must output to a new filename when modifying).
