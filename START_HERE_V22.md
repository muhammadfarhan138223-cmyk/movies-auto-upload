# START HERE — V2.2 Queue Controls

1. Do not run two versions at the same time on port 8766.
2. Stop current V2.1: Pause after current → allow upload to finish → Ctrl+C in terminal.
3. Back up `.env` and the entire `data/` folder before upgrading.
4. To keep your existing queue, apply `MovieHub_V22_QUEUE_PATCH.zip` over the V2.1 folder. Merge only its code/docs; never replace `.env` or `data/`.
5. Run `npm.cmd test` and `npm.cmd start`.
6. Open `http://127.0.0.1:8766`. In a pending video row, use Move to top / Hold / Remove. Held jobs display Resume job.
7. Use the folder path input then Remove pending from this folder to clear accidental bulk queues.
8. Read `docs/GITHUB_PUSH_ROMAN_URDU.md` before publishing a new public repository.

Passwords and keys MUST NOT be committed or screenshotted. Files on disk are not deleted by queue removal.
