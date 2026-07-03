# 📌 Important Links & Deploy Guide

## 🚀 Local Development
- **User Login**: http://localhost:5175/
- **Admin Dashboard**: http://localhost:5175/?admin=true

---

## 🚀 Vercel Deployment Steps

1. Push your code to GitHub (https://github.com/nmmartofficial/NM-BulkMangaer)
2. Go to https://vercel.com/dashboard
3. Click "New Project"
4. Select your repository (NM-BulkMangaer)
5. Add Environment Variables in Vercel:
   - `VITE_SUPABASE_URL`: Your Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key
6. Click "Deploy"!

---

## 🔗 Live Links (After Deployment)
- **Live App**: [Your Vercel URL, e.g., https://nm-bulk-manager.vercel.app/]
- **Admin Dashboard**: [Your Vercel URL]/?admin=true

---

## 📝 Quick Reminder
- Run `npm run build` to test production build
- Run `npm run dev` to test locally
- Make sure your Supabase tables and policies are set up!
