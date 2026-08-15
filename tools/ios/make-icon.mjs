// Renders public/icon.svg into the iOS asset catalog at 1024x1024.
//
//   npm run ios:icon
//
// Two things Apple insists on that the web icon does not do:
//   • NO ALPHA. An icon with an alpha channel is rejected at upload. The SVG's own background
//     rect fills the canvas, so screenshotting it opaque is enough.
//   • NO BAKED CORNER RADIUS. iOS masks the icon itself; icon.svg carries rx="112" for the PWA,
//     and leaving it in double-rounds the corners on the home screen.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, 'ios/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png')

let svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8')
svg = svg.replace('width="512" height="512"', 'width="1024" height="1024"')
         .replace(/rx="112"/, 'rx="0"')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.setContent(`<body style="margin:0;background:#0c0f1a">${svg}</body>`)
await page.screenshot({ path: out, omitBackground: false })
await browser.close()
console.log(`wrote ${path.relative(root, out)} (1024x1024, no alpha)`)
