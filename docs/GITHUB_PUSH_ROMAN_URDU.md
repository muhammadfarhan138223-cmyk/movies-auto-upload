# GitHub par MovieHub Auto Uploader ko VS Code terminal se push karna — Roman Urdu

**Objective:** public source code dusre users use kar sakein. Video files aur private API credentials public nahi honi chahiye.

## Before publishing

- Official GitHub par **new separate repository** banao: `moviehub-auto-uploader`. Apne existing MovieHub website ki private repo mein ye project mix mat karo.
- New repo ko initial setup mein **README, .gitignore, License se initialize mat karo**, kyunki ZIP ke andar ye sab hain. Baad mein existing repo ho to alag steps chahiye.
- Existing `.env` mein Streamtape/DoodStream/FileMoon/StreamWish secrets ko GitHub se ignore karne ke liye included `.gitignore` verify karo.
- API keys/screenshots jo pehle expose huay hon unhe providers mein rotate karo.
- GitHub par uploaded source ke andar `data/queue.json`, `data/settings.json`, `.env`, `mobile/config.js`, video files, exported CSV nahi hone chahiye.

## VS Code terminal commands

New V2.2 project folder **open** karo: File → Open Folder. Terminal → New Terminal.

```powershell
git --version
git init
git branch -M main
git add .
git status
```

`git status` mein **Changes to be committed** check karo. Ismein `.env`, `data/queue.json`, `data/settings.json`, movie/video files NA hon.

Git ignore verify karo:

```powershell
git check-ignore .env
git check-ignore data/queue.json
git check-ignore mobile/config.js
```

Agar ye ignored files exist karti hain to unke paths print honge. Agar file exist nahi, `git check-ignore` phir bhi pattern check kar sakta hai. Har haal mein `git status` check karo.

Agar kisi secret ko galti se stage kar diya:

```powershell
git restore --staged .env
```

Aur `.gitignore` fix karo. Secret GitHub par push ho chuki ho to key rotate karni hogi.

Phir commit:

```powershell
git commit -m "Initial public release: MovieHub Auto Uploader V2.2"
```

Browser mein `https://github.com/new` par jao. Tumhara connected GitHub account username `muhammadfarhan138223-cmyk` hai. `moviehub-auto-uploader` name se EMPTY repository create karo. Public tabhi select karo jab repo ka source/secrets audit complete ho.

Repository creation ke baad GitHub jo HTTPS repo URL deta hai, use exact paste karo. Example, agar wahi suggested name choose kiya ho:

```powershell
git remote add origin https://github.com/muhammadfarhan138223-cmyk/moviehub-auto-uploader.git
git push -u origin main
```

GitHub sign-in prompt aaye to browser/Git Credential Manager se authorize karo. GitHub password terminal mein type karne ki jagah browser login best hai.

Agar `remote origin already exists` aaye:

```powershell
git remote -v
```

Sahi URL check karne ke baad:

```powershell
git remote set-url origin https://github.com/muhammadfarhan138223-cmyk/moviehub-auto-uploader.git
git push -u origin main
```

Baad mein code update:

```powershell
git add .
git status
git commit -m "Improve upload queue controls"
git push
```

### `git` command not recognized?

Git for Windows install karo: https://git-scm.com/downloads/win. VS Code restart karke `git --version` check karo.

### `Author identity unknown`?

```powershell
git config --global user.name "YOUR_GITHUB_NAME"
git config --global user.email "YOUR_GITHUB_NOREPLY_EMAIL"
```

Apna GitHub public/noreply email GitHub Settings → Emails se dekh kar use kar sakte ho. Real private email chat mein share karne ki zaroorat nahi.

### Public users kaise use karenge?

Repository page par Code → Download ZIP, `.env.example` se apni `.env`, apne **khud ke** API credentials, `npm.cmd test`, `npm.cmd start`. GitHub repo videos host nahi karta.

### GitHub Pages / mobile PWA

`mobile/` folder ke liye included GitHub Pages workflow optional hai. PWA ke liye Supabase account setup aur Auth/RLS required. User ke maang ke mutabiq desktop uploader ke queue controls ko chalane ke liye Supabase, Vercel ya mobile deploy karna zaroori nahi.
