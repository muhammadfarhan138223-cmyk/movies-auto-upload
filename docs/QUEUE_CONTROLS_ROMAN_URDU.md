# MovieHub Auto Uploader V2.2 — Queue Controls (Roman Urdu)

Yeh upgrade existing laptop uploader ke liye hai. Streamtape, DoodStream, FileMoon aur StreamWish ke host adapters pehle ki tarah rehte hain. Supabase aur Vercel in uploads ke liye required nahi.

## Kaun si files replace hoti hain?

- `src/queue.mjs`: pending/held jobs ko remove, hold, resume, prioritize; saved JSON queue ko preserve karta hai.
- `src/server.mjs`: new localhost-only API endpoints.
- `public/index.html`: new **Remove pending from this folder** button aur updated help.
- `public/app.js`: per-video **Move to top, Hold, Resume job, Remove** buttons.
- `public/style.css`: small action buttons styling.
- `tests/queue-controls.test.mjs`: unit tests.
- `.gitignore`, `package.json`, `README.md`: safety, version aur docs.

**IMPORTANT:** `.env`, `data/queue.json`, `data/settings.json` ko replace/delete MAT karna. Patch mein yeh files included nahin honi chahiye.

## Buttons ka behavior

| Button | Kya karega |
|---|---|
| `Add folder to queue` | Folder aur subfolders ki supported files ke new host jobs banayega. |
| `Start uploading` | Pending queue start/restart. Paused ke baad yahi **Resume Queue** hai. |
| `Pause after current` | Active file puri karega, phir next job shuru nahi karega. Laptop shutdown nahi hoga. |
| `⬆ Move to top` | Selected pending job ko pending uploads mein sabse pehle rakhega. Already active upload interrupt nahi hoga. |
| `⏸ Hold` | Sirf selected pending job ko roke ga. Baqi jobs chalti rahengi. |
| `▶ Resume job` | Held job ko wapas pending karega. Agar queue idle ho to `Start uploading` bhi dabao. |
| `✕ Remove` | Sirf pending/held job ko queue se hataega. Original video USB/laptop par SAFE rahegi. |
| `Remove pending from this folder` | Path field mein folder enter karke uske andar ke sab pending/held jobs delete kar sakte ho, confirmation ke baad. **Subfolders bhi match hote hain.** |
| `Clear completed` | Sirf completed history hatata hai. Host par uploaded files delete nahi hoti. Pehle CSV export karo. |
| `Export CSV` | Upload links aur statuses save karta hai. |
| `Auto Shutdown` | Explicitly enabled ho tab successful complete batch ke baad countdown + shutdown. Agar running ke dauran jobs manually remove/hold/priority badle to is run ka shutdown safety ke liye skip hota hai. |

### Example A: Galat video queue mein add hui

1. Upload Queue ke neeche video ki row dhoondo.
2. Agar `pending` hai to `✕ Remove` dabao aur confirm karo.
3. File tumhare USB/laptop se delete nahi hogi.
4. Agar `uploading` hai to usse direct remove nahi kar sakte; `Pause after current` dabao, us upload ko complete hone do. Current upload host par chali jayegi. Baaki pending rows remove kar sakte ho.

### Example B: 69 videos D:\\ se galti se add ho gayin

1. Folder path mein `D:\\` likho.
2. **Remove pending from this folder** dabao.
3. Confirmation mein count aur folder dekhkar confirm karo.
4. Sirf pending/held jobs remove hongi; completed, active aur original videos safe rahengi.
5. Ab `D:\\MovieHub_Uploads` jaisa specific authorized-video folder add karo.

### Example C: Important video pehle upload karni ho

1. Queue mein us video ke pending row par `⬆ Move to top` dabao.
2. Agar abhi doosri video uploading hai to woh complete hogi.
3. Uske turant baad prioritized video next hogi.
4. Queue order saved rehta hai even after app restart.

### Example D: Video ko filhaal skip karna ho

1. Pending video par `⏸ Hold` dabao.
2. Uploader doosri pending videos ko process karta rahega.
3. Jab ready ho, `▶ Resume job` dabao.
4. Agar uploader `Paused / Idle` ho, `Start uploading` dabao.

**Repeated scan**: Removed job ko same folder se dubara `Add folder to queue` se add karoge to woh phir aa jayegi. Ye expected hai.

## Safe installation — existing V2.1 ko PATCH karo

1. Agar current transfer hai, `Pause after current` dabao aur finish hone do. VS Code terminal mein `Ctrl + C`, phir `Y` agar prompt aaye.
2. Existing V2.1 folder ki complete copy backup mein rakho. Especially `.env`, `data/queue.json`, `data/settings.json`.
3. `MovieHub_V22_QUEUE_PATCH.zip` extract karo.
4. Extracted `src`, `public`, `tests`, `.gitignore`, `package.json`, `README.md`, `docs` ko V2.1 folder mein **merge/replace** karo.
5. `.env` aur `data` ko nahi chhedna.
6. Terminal mein `npm.cmd test`, phir `npm.cmd start`.
7. Local browser: `http://127.0.0.1:8766`.
8. Pehle ek harmless pending job add karke Hold/Resume/Prioritize/Remove buttons check karo.

Full `MovieHub_Auto_Uploader_V2_2_FULL.zip` GitHub ke liye new clean project bhi de sakta hai, lekin existing queue migrate karte waqt patch safer hai.

## GitHub instructions

Detail ke liye `docs/GITHUB_PUSH_ROMAN_URDU.md` dekho. **Kabhi `.env`, real API passwords, queue.json, video files, screenshots, local CSV, private status data GitHub par push mat karna.** Tumhari API keys pehle screenshot mein visible ho chuki hain; **rotate/regenerate** karna recommended hai.

Sirf authorized/licensed videos hosting providers par upload karo.
