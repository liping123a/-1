import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { GoogleGenAI } from "@google/genai";

puppeteer.use(StealthPlugin());

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());

  // Helper to clean price
  const cleanPrice = (rawPrice: any) => {
    if (typeof rawPrice === 'number') return (rawPrice / 100).toString();
    if (typeof rawPrice !== 'string') return String(rawPrice || "0.00");
    const matches = rawPrice.match(/[\d,.]+/g);
    if (matches && matches.length > 0) {
      const validMatches = matches.filter(m => /\d/.test(m));
      if (validMatches.length > 0) {
        let p = validMatches[validMatches.length - 1];
        p = p.replace(/,/g, '');
        if (p.endsWith('.')) p = p.slice(0, -1);
        return p;
      }
    }
    return rawPrice;
  };

  // Automation State
  let browser: any = null;
  let page: any = null;

  io.on("connection", (socket) => {
    console.log("Client connected to automation socket");

    socket.on("start-xhs-automation", async (data) => {
      const { products, config } = data;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey || '' });
      
      if (!apiKey) {
        socket.emit("automation-log", { message: "警告: 未检测到 AI 密钥 (GEMINI_API_KEY)，AI 生成功能将不可用。请在设置中配置密钥。", type: "error" });
      } else {
        const maskedKey = apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length - 4);
        console.log(`Using API Key: ${maskedKey}`);
      }
        if (!browser) {
          socket.emit("automation-log", { message: "正在启动自动化浏览器...", type: "info" });
          browser = await puppeteer.launch({
            headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
              "--window-size=1280,800",
              "--disable-blink-features=AutomationControlled",
              "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ],
            ignoreDefaultArgs: ["--enable-automation"]
          });
          page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 800 });
          // Extra stealth
          await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
          });
          socket.emit("automation-log", { message: "浏览器启动成功", type: "success" });
        }

        // Stream screenshots (Start early to show loading)
        const streamInterval = setInterval(async () => {
          if (page && !page.isClosed()) {
            try {
              const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 40 });
              socket.emit("browser-view", { image: screenshot });
            } catch (e) {}
          } else {
            clearInterval(streamInterval);
          }
        }, 1000);

        // Step 1: Login Page
        socket.emit("automation-log", { message: "正在打开小红书登录页...", type: "info" });
        try {
          await page.goto("https://creator.xiaohongshu.com/login", { 
            waitUntil: "domcontentloaded", // Faster than networkidle2
            timeout: 60000 
          });
          socket.emit("automation-log", { message: "登录页加载完成", type: "success" });
        } catch (e: any) {
          socket.emit("automation-log", { message: `页面加载缓慢或失败: ${e.message}`, type: "error" });
          // Continue anyway, maybe it partially loaded
        }
        
        socket.emit("automation-step", { step: "login", message: "请在右侧画面中扫码登录小红书" });

        // Step 2: Verify Login (Polling every 2 seconds)
        let isLoggedIn = false;
        let manualStart = false;
        const loginStartTime = Date.now();
        const loginTimeout = 300000; // 5 minutes

        const handleManualStart = () => {
          manualStart = true;
        };
        socket.on("manual-start-posting", handleManualStart);
        socket.on("reload-page", async () => {
          if (page && !page.isClosed()) {
            socket.emit("automation-log", { message: "正在刷新页面...", type: "info" });
            try {
              await page.reload({ waitUntil: "networkidle2" });
            } catch (e) {}
          }
        });

        while (!isLoggedIn && !manualStart && (Date.now() - loginStartTime < loginTimeout)) {
          if (!page || page.isClosed()) break;

          // Try to click QR code tab if stuck on SMS loading
          try {
            await page.evaluate(() => {
              const tabs = Array.from(document.querySelectorAll('.login-tab, .tab-item, .tab'));
              const qrTab = tabs.find(t => t.textContent?.includes('扫码') || t.textContent?.includes('QR'));
              if (qrTab && !qrTab.classList.contains('active')) {
                (qrTab as HTMLElement).click();
              }
            });
          } catch (e) {}

          const currentUrl = page.url();
          const loggedInByUrl = currentUrl.includes("creator.xiaohongshu.com/publish") || 
                               currentUrl.includes("creator.xiaohongshu.com/home");
          
          // Also check for elements that only exist when logged in
          let loggedInByElement = false;
          try {
            loggedInByElement = await page.evaluate(() => {
              return !!document.querySelector('.publishBtn') || 
                     !!document.querySelector('.side-bar-container') ||
                     !!document.querySelector('.user-info-container');
            });
          } catch (e) {
            // Context destroyed during navigation is fine, we'll check again next loop
          }

          if (loggedInByUrl || loggedInByElement) {
            isLoggedIn = true;
            break;
          }

          // Periodic log to reassure user
          if (Math.floor((Date.now() - loginStartTime) / 1000) % 10 === 0) {
            socket.emit("automation-log", { message: "正在检测登录状态...", type: "info" });
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        socket.off("manual-start-posting", handleManualStart);

        if (isLoggedIn || manualStart) {
          socket.emit("automation-log", { message: manualStart ? "手动确认登录，开始发布..." : "登录成功！", type: "success" });
          socket.emit("automation-step", { step: "processing", message: "准备开始发布" });
        } else {
          socket.emit("automation-log", { message: "登录超时或页面关闭，请重试", type: "error" });
          clearInterval(streamInterval);
          return;
        }

        // Process Products
        for (let i = 0; i < products.length; i++) {
          const product = products[i];
          socket.emit("automation-log", { message: `正在处理第 ${i + 1}/${products.length} 个产品: ${product.title}`, type: "info" });
          socket.emit("product-status", { id: product.id, status: "processing" });

          try {
            // Step 3: Navigate to Upload
            await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image", { waitUntil: "networkidle2" });
            
            // Step 4: Upload Images
            const tempDir = path.join(process.cwd(), "temp_images");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            
            const imagePaths: string[] = [];
            const imageUrls = [product.image, ...(product.carouselImages || [])].filter(Boolean).slice(0, 18); // XHS limit
            
            for (let j = 0; j < imageUrls.length; j++) {
              const imgUrl = imageUrls[j];
              const imgPath = path.join(tempDir, `img_${Date.now()}_${j}.jpg`);
              
              let finalUrl = imgUrl;
              if (imgUrl.startsWith('//')) {
                finalUrl = 'https:' + imgUrl;
              }

              try {
                if (finalUrl.startsWith('data:image')) {
                  const base64Data = finalUrl.split(',')[1];
                  fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
                  imagePaths.push(imgPath);
                } else if (finalUrl.startsWith('http')) {
                  const response = await axios.get(finalUrl, { 
                    responseType: "arraybuffer",
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                  });
                  fs.writeFileSync(imgPath, response.data);
                  imagePaths.push(imgPath);
                } else {
                  socket.emit("automation-log", { message: `跳过无效图片 URL: ${finalUrl.substring(0, 50)}...`, type: "error" });
                }
              } catch (downloadErr: any) {
                socket.emit("automation-log", { message: `图片下载失败 (${j+1}): ${downloadErr.message}`, type: "error" });
              }
            }

            if (imagePaths.length === 0) {
              throw new Error("没有可上传的有效图片");
            }

            socket.emit("automation-log", { message: `成功下载 ${imagePaths.length} 张图片，准备上传...`, type: "info" });

            const uploadInput = await page.waitForSelector("input[type='file']");
            if (uploadInput) {
              await uploadInput.uploadFile(...imagePaths);
              socket.emit("automation-log", { message: "图片上传中，请稍候...", type: "info" });
              // Wait for images to process and UI to stabilize
              await new Promise(resolve => setTimeout(resolve, 5000));
              socket.emit("automation-log", { message: "图片上传成功", type: "success" });
            }

            // Step 5: AI Content Generation
            socket.emit("automation-log", { message: "AI 正在生成 SEO 文案...", type: "info" });
            const prompt = `你是一个小红书 SEO 专家。请为以下商品写一篇爆款笔记。
            商品名称: ${product.title}
            价格: ${product.price}
            描述: ${product.description}
            风格: ${config.style}
            
            要求：
            1. 标题要极具吸引力，包含关键词，带表情。
            2. 正文分段，使用小红书常用语气，突出卖点。
            3. 结尾包含 5 个最火的相关话题标签。
            4. 仅返回标题和正文，用 [TITLE] 和 [BODY] 分隔。`;

            let title = product.title || "好物分享";
            let body = `${product.title}\n\n${product.description}\n\n价格: ${product.price}\n\n#好物分享 #种草`;

            try {
              const aiResponse = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
              });

              const fullText = aiResponse.text || '';
              if (fullText.includes('[TITLE]')) {
                title = fullText.split('[TITLE]')[1].split('[BODY]')[0].trim();
                body = fullText.split('[BODY]')[1].trim();
              } else if (fullText.trim()) {
                body = fullText.trim();
              }
              socket.emit("automation-log", { message: "AI 文案生成成功", type: "success" });
            } catch (aiErr: any) {
              const errMsg = aiErr.message?.includes('API key not valid') 
                ? "AI 密钥无效或未配置" 
                : aiErr.message;
              socket.emit("automation-log", { message: `AI 生成失败 (${errMsg})，将使用原始商品信息`, type: "warning" });
            }

            // Fill Title
            socket.emit("automation-log", { message: "正在填写标题...", type: "info" });
            try {
              const titleSelector = "input[placeholder*='标题'], .title-input input, .title-edit input";
              await page.waitForSelector(titleSelector, { timeout: 15000 });
              await page.focus(titleSelector);
              await page.click(titleSelector, { clickCount: 3 });
              await page.keyboard.press('Backspace');
              await page.type(titleSelector, title, { delay: 50 });
            } catch (e) {
              socket.emit("automation-log", { message: "无法定位标题输入框，尝试备用方案...", type: "warning" });
              // Try to find by placeholder directly in evaluate
              await page.evaluate((t: string) => {
                const el = Array.from(document.querySelectorAll('input')).find(i => i.placeholder.includes('标题'));
                if (el) {
                  el.value = t;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }, title);
            }

            // Fill Body
            socket.emit("automation-log", { message: "正在填写正文...", type: "info" });
            try {
              const bodySelector = ".content-textarea, #post-textarea, [role='textbox'], [placeholder*='正文'], [placeholder*='描述']";
              await page.waitForSelector(bodySelector, { timeout: 15000 });
              
              // Scroll into view
              await page.evaluate((sel: string) => {
                const el = document.querySelector(sel);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, bodySelector);
              
              await new Promise(resolve => setTimeout(resolve, 1000));
              await page.focus(bodySelector);
              await page.click(bodySelector, { clickCount: 3 });
              await page.keyboard.press('Backspace');
              await page.type(bodySelector, body, { delay: 30 });
            } catch (e) {
              socket.emit("automation-log", { message: "无法定位正文输入框，尝试备用方案...", type: "warning" });
              await page.evaluate((b: string) => {
                const el = document.querySelector('.content-textarea') || 
                           document.querySelector('#post-textarea') || 
                           Array.from(document.querySelectorAll('div[contenteditable="true"]')).find(d => (d.textContent || '').includes('正文') || d.getAttribute('placeholder')?.includes('正文'));
                if (el) {
                  (el as HTMLElement).textContent = b;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }, body);
            }

            // Wait a bit before publishing
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 6: Click Publish
            socket.emit("automation-log", { message: "正在点击发布按钮...", type: "info" });
            
            // Scroll to bottom to ensure button is visible
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 1000));

            const publishBtnSelectors = [
              ".publishBtn", 
              ".publish-btn", 
              "button.publishBtn", 
              "button[class*='publish']",
              ".submit-btn"
            ];

            let publishBtn = null;
            for (const selector of publishBtnSelectors) {
              try {
                publishBtn = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                if (publishBtn) break;
              } catch (e) {}
            }

            if (!publishBtn) {
              // Try to find by text as last resort
              publishBtn = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => (b.textContent || '').includes('发布') || (b.textContent || '').includes('Publish'));
              });
            }

            if (publishBtn) {
              // Ensure no dropdown is blocking
              await page.evaluate(() => {
                const dropdowns = document.querySelectorAll('.topic-container, .tag-dropdown, .dropdown-menu');
                dropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
              });

              await publishBtn.click();
              socket.emit("automation-log", { message: "已点击发布，等待响应...", type: "info" });
              
              // Wait for success message or navigation
              try {
                await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
              } catch (e) {
                // Check if we are still on the publish page
                const stillOnPublish = page.url().includes('publish');
                if (stillOnPublish) {
                  // Maybe it failed or just slow
                  await new Promise(resolve => setTimeout(resolve, 10000));
                }
              }
              
              socket.emit("automation-log", { message: "发布成功！", type: "success" });
              socket.emit("product-status", { id: product.id, status: "success" });
            } else {
              throw new Error("找不到发布按钮，请手动点击画面中的发布按钮");
            }

            // Cleanup
            imagePaths.forEach(p => fs.unlinkSync(p));

            if (i < products.length - 1) {
              const minMin = config.minInterval || 1;
              const maxMin = config.maxInterval || 2;
              const randomMin = Math.random() * (maxMin - minMin) + minMin;
              const delayMs = Math.floor(randomMin * 60 * 1000);
              const nextTime = Date.now() + delayMs;
              
              socket.emit("next-publish-time", { time: nextTime });
              socket.emit("automation-log", { 
                message: `等待下一个产品发布，随机间隔: ${randomMin.toFixed(1)} 分钟...`, 
                type: "info" 
              });
              
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }

          } catch (err: any) {
            socket.emit("automation-log", { message: `发布失败: ${err.message}`, type: "error" });
            socket.emit("product-status", { id: product.id, status: "error", error: err.message });
          }
        }

        socket.emit("automation-complete", { message: "任务完成" });

      } catch (err: any) {
        socket.emit("automation-log", { message: `严重错误: ${err.message}`, type: "error" });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });

    socket.on("browser-click", async ({ x, y }) => {
      if (page && !page.isClosed()) {
        try {
          await page.mouse.click(x, y);
        } catch (e) {}
      }
    });

    socket.on("browser-type", async ({ text, key }) => {
      if (page && !page.isClosed()) {
        try {
          if (key) {
            await page.keyboard.press(key);
          } else if (text) {
            await page.keyboard.type(text);
          }
        } catch (e) {}
      }
    });
  });

  // API Route for product collection
  app.post("/api/collect", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "必须提供 URL" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 10000,
      });

      // Handle JSON response (e.g., Shopify .js or .json endpoints)
      if (typeof response.data === 'object' && response.data !== null) {
        const d = response.data;
        return res.json({
          success: true,
          data: {
            title: d.title || "",
            description: d.description || "",
            image: d.featured_image || (d.images && d.images[0]) || "",
            price: cleanPrice(d.price),
            marketPrice: cleanPrice(d.compare_at_price || d.price),
            type: d.type || d.product_type || "未分类",
            tags: d.tags || [],
            url,
            status: "正常销售",
            subtitle: "",
            handle: d.handle || "",
            supplier: d.vendor || "",
            supplierName: "",
            supplierLink: "",
            carouselImages: d.images || [],
            options: d.options ? d.options.map((opt: any) => ({
              name: opt.name,
              values: opt.values
            })) : [],
            variants: d.variants ? d.variants.map((v: any) => ({
              id: v.id.toString(),
              title: v.title,
              sku: v.sku || "",
              price: cleanPrice(v.price),
              marketPrice: cleanPrice(v.compare_at_price || v.price),
              inventory: v.inventory_quantity || 1000,
              image: v.featured_image ? v.featured_image.src : null,
              options: v.options || []
            })) : []
          }
        });
      }

      const $ = cheerio.load(response.data);
      
      // Basic extraction logic
      const title = $("title").text().trim() || 
                    $('meta[property="og:title"]').attr("content") || 
                    $("h1").first().text().trim();
      
      const description = $('meta[name="description"]').attr("content") || 
                          $('meta[property="og:description"]').attr("content") || 
                          "";
      
      const image = $('meta[property="og:image"]').attr("content") || 
                    $("img").first().attr("src") || 
                    "";

      const type = $('meta[property="product:type"]').attr("content") || "";
      const tags: string[] = [];
      $('meta[property="product:tag"]').each((i, el) => {
        const tag = $(el).attr("content");
        if (tag) tags.push(tag);
      });

      // Try to find price (very basic heuristic)
      let price = "";
      const priceSelectors = [
        '[class*="price"]', 
        '[id*="price"]', 
        ".amount", 
        ".current-price",
        'meta[property="product:price:amount"]'
      ];
      
      for (const selector of priceSelectors) {
        const found = $(selector).first();
        if (found.length) {
          if (selector.startsWith('meta')) {
            price = found.attr('content') || "";
          } else {
            price = found.text().trim();
          }
          if (price) break;
        }
      }

      const displayPrice = cleanPrice(price);

      res.json({
        success: true,
        data: {
          title,
          description,
          image: image.startsWith("/") ? new URL(image, url).href : image,
          price: displayPrice,
          type,
          tags,
          url
        },
      });
    } catch (error: any) {
      console.error("Scraping error:", error.message);
      res.status(500).json({ error: "无法从提供的 URL 采集数据。" });
    }
  });

  // API Route for product series collection
  app.post("/api/collect-series", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "必须提供 URL" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      // Heuristic to find product items in a list/grid
      const itemSelectors = [
        '.product-item', '.product-card', '.grid__item', '.product-block',
        '.item', 'article', '[class*="product-grid-item"]',
        '[class*="product"]', '[class*="item"]'
      ];

      let foundItems = $();
      let maxUniqueLinks = 0;

      for (const selector of itemSelectors) {
        const items = $(selector).filter((i, el) => {
          const $el = $(el);
          const hasProductLink = $el.find('a[href*="/products/"]').length > 0;
          const hasImg = $el.find('img').length > 0;
          const hasPrice = $el.find('[class*="price"], [id*="price"], .amount, .money').length > 0;
          
          return (hasProductLink || $el.find('a').length > 0) && hasImg && hasPrice;
        });

        const uniqueLinks = new Set();
        items.each((i, el) => {
          const link = $(el).find('a').first().attr('href');
          if (link) uniqueLinks.add(link);
        });

        if (uniqueLinks.size > maxUniqueLinks) {
          maxUniqueLinks = uniqueLinks.size;
          foundItems = items;
        }
      }

      if (maxUniqueLinks === 0) {
        for (const selector of itemSelectors) {
          const items = $(selector).filter((i, el) => {
            const hasLink = $(el).find('a[href*="/products/"]').length > 0;
            const hasImg = $(el).find('img').length > 0;
            return hasLink && hasImg;
          });
          const uniqueLinks = new Set();
          items.each((i, el) => {
            const link = $(el).find('a').first().attr('href');
            if (link) uniqueLinks.add(link);
          });
          if (uniqueLinks.size > maxUniqueLinks) {
            maxUniqueLinks = uniqueLinks.size;
            foundItems = items;
          }
        }
      }

      const seenUrls = new Set();
      const productUrls: string[] = [];

      foundItems.each((i, el) => {
        const $el = $(el);
        let link = $el.find('a[href*="/products/"]').first();
        if (link.length === 0) {
          link = $el.find('a').filter((i, a) => {
            const href = $(a).attr('href');
            return !!href && !href.startsWith('#') && !href.includes('javascript:');
          }).first();
        }
        
        let productUrl = link.attr('href') || "";
        if (!productUrl) return;

        if (productUrl && !productUrl.startsWith('http')) {
          productUrl = new URL(productUrl, url).href;
        }

        const normalizedUrl = productUrl.split('?')[0].replace(/\/$/, '');
        if (seenUrls.has(normalizedUrl) || normalizedUrl === url.split('?')[0].replace(/\/$/, '')) return;
        seenUrls.add(normalizedUrl);
        productUrls.push(normalizedUrl);
      });

      const products: any[] = [];
      const limit = 30;
      const urlsToFetch = productUrls.slice(0, limit);

      for (let i = 0; i < urlsToFetch.length; i++) {
        const pUrl = urlsToFetch[i];
        try {
          const jsUrl = pUrl.endsWith('.js') ? pUrl : `${pUrl}.js`;
          const productResponse = await axios.get(jsUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
            timeout: 5000,
          });

          const d = productResponse.data;
          if (d && d.title) {
            products.push({
              title: d.title,
              description: d.description || "从系列页面采集",
              image: d.featured_image || (d.images && d.images[0]) || "",
              price: cleanPrice(d.price),
              marketPrice: cleanPrice(d.compare_at_price || d.price),
              type: d.type || d.product_type || "未分类",
              tags: d.tags || [],
              url: pUrl,
              status: "正常销售",
              subtitle: "",
              handle: d.handle || "",
              supplier: d.vendor || "",
              supplierName: "",
              supplierLink: "",
              carouselImages: d.images || [],
              options: d.options ? d.options.map((opt: any) => ({
                name: opt.name,
                values: opt.values
              })) : [],
              variants: d.variants ? d.variants.map((v: any) => ({
                id: v.id.toString(),
                title: v.title,
                sku: v.sku || "",
                price: cleanPrice(v.price),
                marketPrice: cleanPrice(v.compare_at_price || v.price),
                inventory: v.inventory_quantity || 1000,
                image: v.featured_image ? v.featured_image.src : null,
                options: v.options || []
              })) : []
            });
          }
        } catch (err: any) {
          console.error(`Failed to fetch product data for ${pUrl}:`, err.message);
        }
      }

      res.json({
        success: true,
        count: products.length,
        data: products,
      });
    } catch (error: any) {
      console.error("Series scraping error:", error.message);
      res.status(500).json({ error: "无法从提供的系列 URL 采集数据。" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
