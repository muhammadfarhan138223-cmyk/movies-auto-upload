# MovieHub Auto Uploader V2.1 — Four Hosts + V2 Features

**Ye complete version hai. PATCH ki zaroorat nahi.** V1 aur V2 original folder ko delete/overwrite na karein.

## Safe installation
1. V1 aur V2 dono ke terminal mein agar uploader chal raha hai to **Pause after current** aur current transfer ke complete hone ke baad `Ctrl+C`. Uploader ka process stop hone par hi agla step.
2. Is ZIP ko Windows mein Extract All karo. VS Code > File > Open Folder se `MovieHub_Auto_Uploader_V2_4HOST` kholo. Sirf is naye folder ka terminal use karo.
3. Existing **V2** folder ki `.env` ko new folder mein **copy** karo (move nahi), ya `.env.example` ko copy karke `.env` banao. FileMoon/StreamWish variables add karo. **Keys kabhi chat, screenshots ya GitHub par share mat karo.**
4. V1 mein saved 69 pending jobs bhi ho sakti hain. Purani queue abhi import **mat** karo jab tak verify na ho ke sari videos upload karna chahte ho. Naya version empty queue se test karo; baad mein stopped uploader se V1 ya V2 ki `data/queue.json` copy ki ja sakti hai, lekin pehle backup aur purane items review karo. `data/settings.json` tabhi copy karo agar V2 shutdown preferences chahiye; safe default autoShutdown off hai.
5. VS Code Terminal: `npm.cmd test`. Pass hone par `npm.cmd start`. Browser: `http://127.0.0.1:8766`.
6. 4 hosts dikhne chahiye. `Ready` sirf credentials present hone ka indicator hai. FileMoon aur StreamWish ko 5-10 MB ki *apni* video se individually test karo aur provider account mein upload verify karo.
7. Jab confirmed ho, authorized video folder ka path likho, hosts tick karo, **Add folder to queue** aur **Start uploading**.

## API values
```
STREAMTAPE_LOGIN=your-api-login
STREAMTAPE_KEY=your-api-password
DOODSTREAM_KEY=your-dood-api-key
FILEMOON_API_TOKEN=your-filemoon-token
STREAMWISH_API_KEY=your-streamwish-api-key
PORT=8766
```
Existing V2 ke optional Supabase vars blank rakh sakte ho; local uploading par farq nahi hoga.

## What stays
- V2 mobile PWA source, secure remote-monitoring setup, auto-shutdown (explicit opt-in), queue recovery, result link editing.
- Streamtape/DoodStream support plus FileMoon and StreamWish adapters.
- Video bytes direct laptop-to-provider; Vercel/Supabase uploads nahi.
- API integrations changing services par dependent hain; live test required.

## Warning
Public GitHub par kabhi `.env`, `data/queue.json`, `data/settings.json` ya API keys push nahi karni. Old screenshots mein API credentials visible ho chuki hain: **provider dashboards se keys rotate/regenerate** kar ke `.env` update karo before public release. Naya ZIP `.env` ya saved upload data include nahi karta.
