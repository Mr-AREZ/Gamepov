# طراحی Gamepov در فیگما

فایل فیگما: https://www.figma.com/design/O8pjxhfXmL7KQldKhq1Puc

- سبک: Steam Redesign (Community) با تم **نارنجی/مشکی**
- رنگ‌ها به‌صورت Variable در کالکشن `Gamepov/Colors` تعریف شده‌اند؛ مقدارها مطابق `:root` در `src/css/style.css` هستند
- کامپوننت‌ها (صفحه‌ی «Components»): Button/Primary‑Secondary‑Tertiary، Tag، Card/Stream، Card/Game، Header، Footer
- صفحه‌ها (فریم‌های ۱۹۲۰px در صفحه‌ی «Gamepov UI»):
  Home · Game page · Streams archive · Video page (با کامنت) · Schedule · About · Contact & sponsors · Support · Stats & achievements · Account · Admin Dashboard · Admin Streams (لیست + فرم آپلود)
- نسخه‌ی فارسی/راست‌به‌چین در فیگما جدا نیست؛ نسخه‌ی فارسی در خود سایت ساخته شده و تست شده است (`docs/screenshots/home-fa.png`).

| متغیر فیگما | CSS |
|---|---|
| bg/main | `--bg` `#0A0A0A` |
| bg/page | `--page` `#121212` |
| bg/tertiary (هدر) | `--header` `#1C1A18` |
| bg/highlight | `--highlight` `#1F1F1F` |
| bg/hover | `--hover` `#2E2E2E` |
| brand/secondary | `--accent` `#E8650A` |
| accent/green (نام قدیمی؛ حالا نارنجی روشن) | `--accent-light` `#FF8A2B` |
| text/dim | `--dim` `#8C8C8C` |
| accent/live | `--live` `#E5484D` |
