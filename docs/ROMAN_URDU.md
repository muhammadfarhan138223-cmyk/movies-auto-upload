# MovieHub Auto Uploader V2 — Roman Urdu Guide

## Pehle samjho

V1 ka `Pause after current` sirf current upload complete kar ke next video stop karta hai. **Windows shutdown NAHI karta.** V2 mein alag Auto Shutdown setting hai. Ek baar tum usay enable karte ho aur confirmation dete ho. Baad mein jab queue ki SAARI jobs successful complete hon, Windows 1–10 minute ke countdown ke saath shutdown schedule hota hai. Finish hone par dobara permission nahin maangi jati. Countdown mein `Cancel scheduled shutdown` dabakar rok sakte ho. Agar failed/review/pending job ho ya queue pause ki ho, automatic shutdown nahi hoga.

## Existing working V1 se V2 upgrade

1. V1 ki VS Code terminal mein `Ctrl+C` dabakar purana uploader band karo (warna port 8766 already used error ayega). V1 ka pura folder backup rakhna. Purani `.env` ya API keys mujhe chat mein bilkul mat bhejna.
2. V2 ZIP extract karna. VS Code mein naya folder open karna.
3. V2 VS Code terminal mein ye command run karo (path agar alag ho to change karna):

```powershell
node scripts/migrate-from-v1.mjs "C:\Users\Lenovo\Documents\MovieHub_Auto_Uploader_V1\MovieHub_Auto_Uploader"
```

4. Is se V1 ki `.env` aur `data/queue.json` V2 mein copy hoti hain. **V1 original safe rehta hai.**
5. Terminal mein `npm.cmd test`, phir `npm.cmd start`.
6. Browser mein `http://127.0.0.1:8766` kholo. Pehle 10–20 MB ki apni test video upload karo; provider account mein verify karo.
7. Jab sahi kaam kare tab 60 videos wala folder add karna.

## 60 movies ki queue

- USB/flash mein saari authorized video files rakho; folder path jese `E:\Movies`.
- Streamtape ya DoodStream ya dono select karna. Dono select hue toh 60 videos ke **120 upload jobs**.
- Sirf ek baar `Add folder to queue`; purani same video dubara add nahi hoti jab tak path/size/modified date same hai aur queue entry retained hai.
- `Start uploading` click karo. Laptop par actual transfer hota hai aur ek ke baad next job start hoti hai.
- Laptop ko charging aur ventilation par rakho. Windows Plugged In sleep **Never**, display off allowed. Charger/cooling issue ho toh overnight unattended mat chalao.
- Wi-Fi speed automatically increase nahi hoti. 60 large files subah tak complete hone ki guarantee nahi.
- Browser tab band ho sakta hai, lekin uploader ki VS Code terminal window band na karna.

## DoodStream Open Result link issue

Kuch API-provided URLs ka domain broken ho sakta hai. Completed job ke samne **Set working link** click karo aur DoodStream account ke file manager ke `Get Link` se working HTTPS link paste karo. Purana URL alternative mein save rehta hai; remote file delete/reupload nahi hoti.

## Windows Auto Shutdown

1. V2 local dashboard mein **Overnight controls** section.
2. `Shut down Windows automatically after ALL uploads complete` check.
3. Countdown 2 minutes recommend.
4. **Save shutdown setting** aur pehli baar safety confirmation accept karo.
5. Nayi pending queue start karo. Agar sab complete, Windows automatic shutdown countdown start karega.
6. Agar last minute cancel chahiye: `Cancel scheduled shutdown` (ya Windows command `shutdown /a`).

**Warning:** Windows shutdown se dusri apps ka unsaved work lose ho sakta hai. Pehle test ke waqt baaki apps save/close karo. Agar video failed/review ho, automatic shutdown nahi hoga.

## Mobile par kahin se bhi dekhna

Local dashboard `127.0.0.1` mobile se publicly access nahi hota. Secure mobile viewing ke liye `docs/MOBILE_SETUP.md` ka one-time Supabase + GitHub Pages setup zaroori hai.

- Supabase mein owner aur agent ke alag verified users, IDs aur SQL policies setup.
- Laptop `.env` mein agent credentials add karo; public frontend mein nahi.
- Separate public GitHub repo mein code push karo, Actions variables configure karo, Pages deploy karo.
- Phone Chrome mein GitHub Pages link kholo aur Install app karo.
- Email magic link se owner sign-in; jobs phone par private nazar aayengi.
- Agar laptop shutdown, phone par last data "stale/offline" ho jayega. Mobile app read-only hai.

## Kya public release safe hai?

Source code public kar sakte ho, lekin `.env`, upload queue, API keys, videos, CSV reports aur log files ko NEVER push karo. Code ko apne existing MovieHub website repository ke bajaye separate repo mein public release karna best rahega. Provider terms aur video redistribution rights follow karna.
