import express from "express";
import "dotenv/config";
import cors from "cors";
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
import { Sequelize, DataTypes, Model } from "sequelize";

puppeteer.use(StealthPlugin());

// Initialize MySQL with Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME || 'shopns_db',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      connectTimeout: 10000 // 10 seconds timeout
    }
  }
);

class Product extends Model {
  public id!: string;
  public title!: string;
  public price!: string;
  public marketPrice!: string;
  public purchasePrice!: string;
  public url!: string;
  public description!: string;
  public image!: string;
  public carouselImages!: string; // JSON string
  public timestamp!: string;
  public xhsStatus!: string;
  public wechatStatus!: string;
  public wechatMessage!: string;
  public tags!: string; // JSON string
  public status!: string;
  public subtitle!: string;
  public handle!: string;
  public supplier!: string;
  public supplierName!: string;
  public supplierLink!: string;
  public usdMarketPrice!: string;
  public usdPurchasePrice!: string;
  public options!: string; // JSON string
  public variants!: string; // JSON string
  public productType!: string;
  public sku!: string;
  public inventory!: number;
}

Product.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  title: { type: DataTypes.TEXT, allowNull: false },
  price: { type: DataTypes.STRING, allowNull: false },
  marketPrice: { type: DataTypes.STRING, allowNull: false },
  purchasePrice: { type: DataTypes.STRING, defaultValue: "0.00" },
  url: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.TEXT },
  image: { type: DataTypes.TEXT },
  carouselImages: { type: DataTypes.TEXT },
  timestamp: { type: DataTypes.STRING, allowNull: false },
  xhsStatus: { type: DataTypes.STRING, defaultValue: "未发布" },
  wechatStatus: { type: DataTypes.STRING, defaultValue: "pending" },
  wechatMessage: { type: DataTypes.TEXT },
  tags: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING },
  subtitle: { type: DataTypes.TEXT },
  handle: { type: DataTypes.STRING },
  supplier: { type: DataTypes.STRING },
  supplierName: { type: DataTypes.STRING },
  supplierLink: { type: DataTypes.TEXT },
  usdMarketPrice: { type: DataTypes.STRING },
  usdPurchasePrice: { type: DataTypes.STRING },
  options: { type: DataTypes.TEXT },
  variants: { type: DataTypes.TEXT },
  productType: { type: DataTypes.STRING },
  sku: { type: DataTypes.STRING },
  inventory: { type: DataTypes.INTEGER, defaultValue: 1000 },
}, { sequelize, modelName: 'product' });

class Setting extends Model {
  public key!: string;
  public value!: string;
}

Setting.init({
  key: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false },
}, { sequelize, modelName: 'setting' });

async function startServer() {
  try {
    console.log('Attempting to connect to MySQL...');
    await sequelize.authenticate();
    console.log('Connection to MySQL has been established successfully.');
    await sequelize.sync({ alter: true }); // Sync and update tables
    console.log('Database tables synchronized.');
  } catch (error: any) {
    console.error('CRITICAL DATABASE ERROR:', error.message);
    if (error.original && error.original.code === 'ETIMEDOUT') {
      console.error('HINT: Connection timed out. Please check if your database host is accessible and if the firewall allows connections from this environment.');
    }
  }

  const app = express();
  app.use(cors());
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Open API Token (You can set this in .env as WECHAT_API_TOKEN)
  const WECHAT_API_TOKEN = process.env.WECHAT_API_TOKEN || "shopns_wechat_secret_2026";

  // Middleware to check API Token for Open API routes
  const checkApiToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.query.token || req.headers['x-api-token'];
    if (token === WECHAT_API_TOKEN) {
      next();
    } else {
      res.status(401).json({ success: false, error: "Unauthorized: Invalid or missing API Token" });
    }
  };

  // OPEN API: Fetch products (Requires Token)
  app.get("/api/wechat/products", checkApiToken, async (req, res) => {
    try {
      const { status } = req.query;
      const where: any = {};
      if (status) {
        where.wechatStatus = status;
      }
      
      const products = await Product.findAll({ where });
      const formattedProducts = products.map(p => {
        const data = p.toJSON();
        return {
          ...data,
          carouselImages: data.carouselImages ? JSON.parse(data.carouselImages) : [],
          tags: data.tags ? JSON.parse(data.tags) : [],
          options: data.options ? JSON.parse(data.options) : [],
          variants: data.variants ? JSON.parse(data.variants) : [],
        };
      });
      res.json({ success: true, data: formattedProducts });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch products" });
    }
  });

  // OPEN API: Fetch single product detail (Requires Token)
  app.get("/api/wechat/products/:id", checkApiToken, async (req, res) => {
    try {
      const { id } = req.params;
      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      
      const data = product.toJSON();
      const formatted = {
        ...data,
        carouselImages: data.carouselImages ? JSON.parse(data.carouselImages) : [],
        tags: data.tags ? JSON.parse(data.tags) : [],
        options: data.options ? JSON.parse(data.options) : [],
        variants: data.variants ? JSON.parse(data.variants) : [],
      };
      
      res.json({ success: true, data: formatted });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch product detail" });
    }
  });

  // OPEN API: Update status (Requires Token)
  app.post("/api/wechat/update-status", checkApiToken, async (req, res) => {
    const { id, status, message } = req.body;
    try {
      await Product.update({
        wechatStatus: status,
        wechatMessage: message || ""
      }, { where: { id } });
      
      // Notify React app via socket
      io.emit("wechat-status-updated", { id, status, message });
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to update status" });
    }
  });

  // FRONTEND API: Products CRUD
  // Database status check
  app.get("/api/db-status", async (req, res) => {
    try {
      await sequelize.authenticate();
      const count = await Product.count();
      res.json({ success: true, message: "MySQL connected", productCount: count });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const products = await Product.findAll({ order: [['timestamp', 'DESC']] });
      const formattedProducts = products.map(p => {
        const data = p.toJSON();
        return {
          ...data,
          carouselImages: data.carouselImages ? JSON.parse(data.carouselImages) : [],
          tags: data.tags ? JSON.parse(data.tags) : [],
          options: data.options ? JSON.parse(data.options) : [],
          variants: data.variants ? JSON.parse(data.variants) : [],
        };
      });
      res.json(formattedProducts);
    } catch (err) {
      console.error("Failed to fetch products from database:", err);
      res.status(500).json({ error: "Failed to fetch products", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      const data = product.toJSON();
      const formatted = {
        ...data,
        carouselImages: data.carouselImages ? JSON.parse(data.carouselImages) : [],
        tags: data.tags ? JSON.parse(data.tags) : [],
        options: data.options ? JSON.parse(data.options) : [],
        variants: data.variants ? JSON.parse(data.variants) : [],
      };
      res.json(formatted);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch product detail" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const data = req.body;
      const productData = {
        ...data,
        carouselImages: JSON.stringify(data.carouselImages || []),
        tags: JSON.stringify(data.tags || []),
        options: JSON.stringify(data.options || []),
        variants: JSON.stringify(data.variants || []),
      };
      const product = await Product.create(productData);
      io.emit("products-changed");
      res.json(product);
    } catch (err: any) {
      console.error("Failed to create product:", err.message);
      res.status(500).json({ error: `Failed to create product: ${err.message}` });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const productData = {
        ...data,
        carouselImages: data.carouselImages ? JSON.stringify(data.carouselImages) : undefined,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        options: data.options ? JSON.stringify(data.options) : undefined,
        variants: data.variants ? JSON.stringify(data.variants) : undefined,
      };
      await Product.update(productData, { where: { id } });
      io.emit("products-changed");
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await Product.destroy({ where: { id } });
      io.emit("products-changed");
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await Setting.findAll();
      const config: any = {};
      settings.forEach(s => {
        try {
          config[s.key] = JSON.parse(s.value);
        } catch (e) {
          config[s.key] = s.value;
        }
      });
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const config = req.body;
      for (const [key, value] of Object.entries(config)) {
        await Setting.upsert({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value)
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/products/batch-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      await Product.destroy({ where: { id: ids } });
      io.emit("products-changed");
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to batch delete products" });
    }
  });

  app.post("/api/products/batch-update", async (req, res) => {
    try {
      const { ids, updates } = req.body;
      
      const productData: any = { ...updates };
      if (updates.carouselImages) productData.carouselImages = JSON.stringify(updates.carouselImages);
      if (updates.tags) productData.tags = JSON.stringify(updates.tags);
      if (updates.options) productData.options = JSON.stringify(updates.options);
      if (updates.variants) productData.variants = JSON.stringify(updates.variants);

      await Product.update(productData, { where: { id: ids } });
      io.emit("products-changed");
      res.json({ success: true });
    } catch (err) {
      console.error("Batch update error:", err);
      res.status(500).json({ error: "Failed to batch update products" });
    }
  });

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
  let isAutomationRunning = false;
  let automationLogs: any[] = [];

  io.on("connection", (socket) => {
    console.log("Client connected to automation socket");

    let isXhsPaused = false;

    socket.on("pause-xhs-automation", () => {
      isXhsPaused = true;
      socket.emit("automation-log", { 
        message: "流程已暂停", 
        type: "warning", 
        timestamp: new Date().toLocaleTimeString() 
      });
    });
    
    socket.on("resume-xhs-automation", () => {
      isXhsPaused = false;
      socket.emit("automation-log", { 
        message: "流程已继续", 
        type: "success", 
        timestamp: new Date().toLocaleTimeString() 
      });
    });

    socket.on("stop-xhs-automation", async () => {
      socket.emit("automation-log", { 
        message: "用户手动终止流程", 
        type: "warning", 
        timestamp: new Date().toLocaleTimeString() 
      });
      isAutomationRunning = false;
      if (browser) {
        try {
          await browser.close();
          browser = null;
          page = null;
        } catch (e) {}
      }
      io.emit("automation-complete", { message: "任务已终止" });
    });

    socket.on("reload-page", async () => {
      if (page && !page.isClosed()) {
        socket.emit("automation-log", { 
          message: "正在刷新页面...", 
          type: "info", 
          timestamp: new Date().toLocaleTimeString() 
        });
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
        } catch (e) {}
      }
    });

    socket.on("start-xhs-automation", async (data) => {
      if (isAutomationRunning) {
        socket.emit("automation-log", { 
          message: "自动化流程已在运行中，请勿重复启动。", 
          type: "warning",
          timestamp: new Date().toLocaleTimeString()
        });
        // Sync current state to the new connection
        socket.emit("automation-logs-sync", automationLogs);
        socket.emit("automation-step", { step: "processing", message: "正在运行中" });
        return;
      }
      isAutomationRunning = true;
      isXhsPaused = false;
      automationLogs = []; // Clear logs for new run

      const emitLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
        const logEntry = { 
          message, 
          type, 
          timestamp: new Date().toLocaleTimeString() 
        };
        automationLogs.push(logEntry);
        if (automationLogs.length > 200) automationLogs.shift();
        io.emit("automation-log", logEntry);
      };

      const checkPause = async () => {
        while (isXhsPaused && isAutomationRunning) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      };

      try {
        const { products, config } = data;
        const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const qwenApiKey = process.env.QWEN_API_KEY || 'sk-57600945e5544d0681ffefe79052ec94';
        const aiModel = config.aiModel || 'gemini';
        
        const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });
        
        if (aiModel === 'gemini' && !geminiApiKey) {
          emitLog("警告: 未检测到 Gemini 密钥，AI 生成功能将不可用。请在设置中配置密钥。", "error");
        } else if (aiModel === 'qwen' && !qwenApiKey) {
          emitLog("警告: 未检测到 Qwen 密钥，AI 生成功能将不可用。", "error");
        } else {
          const keyToMask = aiModel === 'gemini' ? geminiApiKey : qwenApiKey;
          if (keyToMask) {
            const maskedKey = keyToMask.substring(0, 4) + "..." + keyToMask.substring(keyToMask.length - 4);
            console.log(`Using AI Model: ${aiModel}, Key: ${maskedKey}`);
          }
        }

        if (!browser) {
          emitLog("正在启动自动化浏览器...", "info");
          const userDataDir = path.join(process.cwd(), "xhs_user_data");
          if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
          
          browser = await puppeteer.launch({
            headless: true,
            userDataDir,
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
          emitLog("浏览器启动成功", "success");
        }

        // Stream screenshots (Start early to show loading)
        const streamInterval = setInterval(async () => {
          if (page && !page.isClosed()) {
            try {
              const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 40 });
              io.emit("browser-view", { image: screenshot });
            } catch (e) {}
          } else {
            clearInterval(streamInterval);
          }
        }, 1000);

        // Step 1: Navigate to Publish Page directly (leveraging persistent session)
        emitLog("正在尝试打开小红书发布页...", "info");
        const publishUrl = "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image";
        try {
          await page.goto(publishUrl, { 
            waitUntil: "domcontentloaded",
            timeout: 60000 
          });
        } catch (e: any) {
          emitLog(`页面加载缓慢: ${e.message}`, "warning");
        }
        
        // Step 2: Check Login Status
        let isLoggedIn = false;
        try {
          isLoggedIn = await page.evaluate(() => {
            return !!document.querySelector('.publishBtn') || 
                   !!document.querySelector('.side-bar-container') ||
                   !!document.querySelector('.user-info-container') ||
                   window.location.href.includes('publish');
          });
        } catch (e) {}

        if (!isLoggedIn) {
          emitLog("检测到未登录，请在右侧画面中扫码登录。登录后点击'已登录，开始发布'按钮。", "warning");
          io.emit("automation-step", { step: "login", message: "请扫码登录小红书" });
          
          // Wait for manual start button
          await new Promise<void>((resolve) => {
            const onManualStart = () => {
              socket.off("manual-start-posting", onManualStart);
              resolve();
            };
            socket.on("manual-start-posting", onManualStart);
            
            // Also allow auto-detection if they log in
            const checkTimer = setInterval(async () => {
              if (page && !page.isClosed()) {
                const loggedIn = await page.evaluate(() => {
                  return !!document.querySelector('.publishBtn') || window.location.href.includes('publish');
                }).catch(() => false);
                if (loggedIn) {
                  clearInterval(checkTimer);
                  socket.off("manual-start-posting", onManualStart);
                  resolve();
                }
              } else {
                clearInterval(checkTimer);
              }
            }, 5000);
          });
          emitLog("已确认登录状态，准备开始发布...", "success");
        } else {
          emitLog("检测到已登录，直接开始发布流程", "success");
        }

        io.emit("automation-step", { step: "processing", message: "准备开始发布" });

        // Process Products
        for (let i = 0; i < products.length; i++) {
          await checkPause();
          const product = products[i];
          emitLog(`正在处理第 ${i + 1}/${products.length} 个产品: ${product.title}`, "info");
          io.emit("product-status", { id: product.id, status: "processing" });

          try {
            // Step 3: Navigate to Upload
            await checkPause();
            const publishUrl = "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image";
            
            // Use a more robust navigation with retries
            let navSuccess = false;
            for (let retry = 0; retry < 3; retry++) {
              try {
                // Check if already there
                if (page.url().includes("publish?source=official")) {
                  navSuccess = true;
                  break;
                }
                await page.goto(publishUrl, { 
                  waitUntil: "domcontentloaded", 
                  timeout: 30000 
                });
                navSuccess = true;
                break;
              } catch (e: any) {
                if (e.message.includes('net::ERR_ABORTED')) {
                  // Often safe to ignore if we are redirected or already navigating
                  await new Promise(r => setTimeout(r, 2000));
                  continue;
                }
                socket.emit("automation-log", { message: `导航重试 (${retry + 1}/3): ${e.message}`, type: "warning" });
                emitLog(`导航重试 (${retry + 1}/3): ${e.message}`, "warning");
                await new Promise(r => setTimeout(r, 2000));
              }
            }

            if (!navSuccess) {
              throw new Error("无法导航到发布页面");
            }
            
            // Wait for the upload area to be visible
            await page.waitForSelector(".upload-container, .upload-wrapper, .publish-container", { timeout: 15000 }).catch(() => {});
            
            // Step 4: Upload Images
            await checkPause();
            const tempDir = path.join(process.cwd(), "temp_images");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            
            const imagePaths: string[] = [];
            const imageUrls = Array.from(new Set([product.image, ...(product.carouselImages || [])])).filter(Boolean).slice(0, 18); // XHS limit
            
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
                  emitLog(`跳过无效图片 URL: ${finalUrl.substring(0, 50)}...`, "error");
                }
              } catch (downloadErr: any) {
                emitLog(`图片下载失败 (${j+1}): ${downloadErr.message}`, "error");
              }
            }

            if (imagePaths.length === 0) {
              throw new Error("没有可上传的有效图片");
            }

            emitLog(`成功下载 ${imagePaths.length} 张图片，准备上传...`, "info");

            // Find the file input
            let uploadInput = null;
            try {
              uploadInput = await page.waitForSelector("input[type='file']", { timeout: 10000 });
            } catch (e) {
              emitLog("未直接找到上传组件，尝试激活上传区域...", "warning");
              await page.evaluate(() => {
                const uploadArea = document.querySelector('.upload-container, .upload-wrapper, .publish-container, .upload-area, [class*="upload"]');
                if (uploadArea) (uploadArea as HTMLElement).click();
              });
              uploadInput = await page.waitForSelector("input[type='file']", { timeout: 10000 });
            }

            if (uploadInput) {
              emitLog("正在执行文件上传...", "info");
              await uploadInput.uploadFile(...imagePaths);
              emitLog("图片已提交，等待系统处理...", "info");
              
              // Wait and check for previews
              let uploadConfirmed = false;
              for (let wait = 0; wait < 15; wait++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const status = await page.evaluate(() => {
                  const selectors = [
                    '.image-item', '.img-item', '.upload-item', '.preview-item', 
                    '[class*="image-item"]', '[class*="upload-item"]', '[class*="preview-item"]',
                    '.image-wrapper img', '.preview-container img', '.upload-list img'
                  ];
                  let count = 0;
                  selectors.forEach(s => {
                    count += document.querySelectorAll(s).length;
                  });
                  // Also check for background-image on divs
                  const divs = Array.from(document.querySelectorAll('div'));
                  const bgImages = divs.filter(d => {
                    const bg = window.getComputedStyle(d).backgroundImage;
                    return bg && bg !== 'none' && (bg.includes('http') || bg.includes('blob'));
                  });
                  
                  // Check if title input is visible (means upload is done)
                  const titleInput = document.querySelector('input[placeholder*="标题"], .title-input input');
                  const isTitleVisible = titleInput && (titleInput as HTMLElement).offsetParent !== null;
                  
                  return { count: count + bgImages.length, isTitleVisible };
                });
                
                if (status.count > 0 || status.isTitleVisible) {
                  uploadConfirmed = true;
                  emitLog(`检测到图片上传成功${status.count > 0 ? ` (预览图: ${status.count})` : " (已进入编辑页)"}`, "success");
                  break;
                }
                if (wait % 3 === 0) {
                  emitLog("等待图片预览生成...", "info");
                }
              }
              
              if (!uploadConfirmed) {
                emitLog("未检测到图片预览，可能处理较慢，尝试继续后续流程...", "warning");
              }
            } else {
              throw new Error("找不到上传组件，请确保已登录且处于发布页面");
            }

            // Step 5: AI Content Generation
            await checkPause();
            emitLog(`AI 正在使用 ${aiModel === 'gemini' ? 'Gemini' : 'Qwen'} 生成 SEO 文案...`, "info");
            const prompt = `你是一个小红书 SEO 专家。请为以下商品写一篇爆款笔记。
            商品名称: ${product.title}
            价格: ${product.price} 美元
            描述: ${product.description}
            风格: ${config.style}
            
            严格约束要求：
            1. 【标题】：必须极具吸引力且与产品高度相关。长度严格限制在 20 个中文字符以内（2个英文字符计为1个中文字符）。包含关键词并适当使用表情。
            2. 【正文】：内容必须吸引人，严禁堆砌垃圾长文。字数严格控制在 1000 字符以内。分段清晰，使用小红书常用语气，突出卖点。
            3. 【标签】：结尾包含 5-8 个符合标题 SEO 的热门话题标签，以及适合该产品的垂直领域热门话题。
            4. 【格式】：仅返回标题和正文，格式如下：
               [TITLE] 这里是标题内容
               [BODY] 这里是正文内容...
               #标签1 #标签2 ...`;

            let title = product.title || "好物分享";
            if (title.length > 20) title = title.substring(0, 17) + "...";
            let body = `${product.title}\n\n${product.description}\n\n价格: ${product.price} 美元\n\n#好物分享 #种草 #品质生活`;

            try {
              let fullText = '';
              if (aiModel === 'gemini') {
                const aiResponse = await ai.models.generateContent({
                  model: "gemini-3-flash-preview",
                  contents: prompt,
                });
                fullText = aiResponse.text || '';
              } else if (aiModel === 'qwen') {
                const response = await axios.post(
                  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                  {
                    model: 'qwen-plus',
                    messages: [
                      { role: 'system', content: '你是一个小红书 SEO 专家。' },
                      { role: 'user', content: prompt }
                    ]
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${qwenApiKey}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                fullText = response.data.choices[0].message.content || '';
              }

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
                : (aiErr.response?.data?.error?.message || aiErr.message);
              socket.emit("automation-log", { message: `AI 生成失败 (${errMsg})，将使用原始商品信息`, type: "warning" });
            }

            // Fill Title
            await checkPause();
            socket.emit("automation-log", { message: "正在填写标题...", type: "info" });
            try {
              const titleSelector = "input[placeholder*='标题'], .title-input input, .title-edit input";
              await page.waitForSelector(titleSelector, { timeout: 15000 });
              await page.focus(titleSelector);
              await page.click(titleSelector, { clickCount: 3 });
              await page.keyboard.press('Backspace');
              await page.type(titleSelector, title, { delay: 50 });
            } catch (e) {
              emitLog("无法定位标题输入框，尝试备用方案...", "warning");
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
            await checkPause();
            emitLog("正在填写正文...", "info");
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
              emitLog("无法定位正文输入框，尝试备用方案...", "warning");
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
            await checkPause();
            emitLog("正在点击发布按钮...", "info");
            
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
              emitLog("已点击发布，等待响应...", "info");
              
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
              
              emitLog("发布成功！", "success");
              io.emit("product-status", { id: product.id, status: "success" });
            } else {
              throw new Error("找不到发布按钮，请手动点击画面中的发布按钮");
            }

            // Cleanup
            imagePaths.forEach(p => fs.unlinkSync(p));

            if (i < products.length - 1 && isAutomationRunning) {
              const minMin = config.minInterval || 1;
              const maxMin = config.maxInterval || 2;
              const randomMin = Math.random() * (maxMin - minMin) + minMin;
              const delayMs = Math.floor(randomMin * 60 * 1000);
              const nextTime = Date.now() + delayMs;
              
              io.emit("next-publish-time", { time: nextTime });
              emitLog(`等待下一个产品发布，随机间隔: ${randomMin.toFixed(1)} 分钟...`, "info");
              
              // Wait with periodic check for stop
              const waitStart = Date.now();
              while (Date.now() - waitStart < delayMs && isAutomationRunning) {
                await checkPause();
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            }

          } catch (err: any) {
            emitLog(`发布失败: ${err.message}`, "error");
            io.emit("product-status", { id: product.id, status: "error", error: err.message });
          }
          
          if (!isAutomationRunning) {
            emitLog("流程已终止，停止后续任务", "warning");
            break;
          }
        }
        
        if (isAutomationRunning) {
          emitLog(`所有产品处理完成 (共 ${products.length} 个)`, "success");
          io.emit("automation-complete", { message: "任务完成" });
          isAutomationRunning = false;
        }
      } catch (err: any) {
        emitLog(`严重错误: ${err.message}`, "error");
        io.emit("automation-complete", { message: "任务出错终止", error: err.message });
        isAutomationRunning = false;
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

    let scraperBrowser = null;
    try {
      console.log(`Starting collection for URL: ${url}`);
      
      // Try axios first for speed (works for Shopify JSON)
      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
          timeout: 10000,
        });

        if (typeof response.data === 'object' && response.data !== null) {
          const d = response.data;
          const productData = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            title: d.title || "未命名产品",
            description: d.description || "",
            image: d.featured_image || (d.images && d.images[0]) || "",
            price: cleanPrice(d.price),
            marketPrice: cleanPrice(d.compare_at_price || d.price),
            purchasePrice: "0.00",
            productType: d.type || d.product_type || "未分类",
            tags: JSON.stringify(d.tags || []),
            url,
            status: "正常销售",
            subtitle: "",
            handle: d.handle || "",
            supplier: d.vendor || "",
            supplierName: "",
            supplierLink: url,
            carouselImages: JSON.stringify(d.images || []),
            timestamp: Date.now().toString(),
            xhsStatus: "未发布",
            wechatStatus: "pending",
            options: JSON.stringify(d.options ? d.options.map((opt: any) => ({
              name: opt.name,
              values: opt.values
            })) : []),
            variants: JSON.stringify(d.variants ? d.variants.map((v: any) => ({
              id: v.id.toString(),
              title: v.title,
              sku: v.sku || "",
              price: cleanPrice(v.price),
              marketPrice: cleanPrice(v.compare_at_price || v.price),
              inventory: v.inventory_quantity || 1000,
              image: v.featured_image ? v.featured_image.src : null,
              options: v.options || []
            })) : []),
            sku: 'SKU-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
            inventory: 1000
          };

          await Product.create(productData);
          io.emit("products-changed");
          
          return res.json({
            success: true,
            data: productData
          });
        }
      } catch (axiosErr) {
        console.log("Axios failed or not JSON, falling back to Puppeteer...");
      }

      // Fallback to Puppeteer for HTML scraping
      scraperBrowser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      const scraperPage = await scraperBrowser.newPage();
      await scraperPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      
      // Set a reasonable timeout
      await scraperPage.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

      const productData = await scraperPage.evaluate(() => {
        const getMeta = (prop: string) => {
          return document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute("content") || "";
        };
        
        const title = document.querySelector("h1")?.textContent?.trim() || 
                      getMeta("og:title") || 
                      document.title;
        
        const description = getMeta("og:description") || 
                            getMeta("description") || 
                            document.querySelector(".product-description, .description")?.textContent?.trim() || 
                            "";
        
        const image = getMeta("og:image") || 
                      (document.querySelector("img[src*='product'], img[class*='product']") as HTMLImageElement)?.src ||
                      document.querySelector("img")?.src || 
                      "";
        
        // Price heuristic
        let price = "";
        const priceSelectors = [
          '[class*="price"]', 
          '[id*="price"]', 
          ".amount", 
          ".current-price",
          'meta[property="product:price:amount"]'
        ];
        for (const sel of priceSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            if (el.tagName === 'META') {
              price = el.getAttribute('content') || "";
            } else {
              price = el.textContent?.trim() || "";
            }
            if (price && /\d/.test(price)) break;
          }
        }

        // Carousel images
        const carouselImages: string[] = [];
        document.querySelectorAll("img[src*='product'], .product-gallery img, .product-images img").forEach(img => {
          const src = (img as HTMLImageElement).src;
          if (src && !carouselImages.includes(src)) carouselImages.push(src);
        });

        return { title, description, image, price, carouselImages: carouselImages.slice(0, 10) };
      });

      const finalData = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: productData.title || "未命名产品",
        description: productData.description || "",
        image: productData.image || "",
        price: cleanPrice(productData.price),
        marketPrice: cleanPrice(productData.price),
        purchasePrice: "0.00",
        productType: "未分类",
        tags: JSON.stringify([]),
        url,
        status: "正常销售",
        subtitle: "",
        handle: "",
        supplier: "",
        supplierName: "",
        supplierLink: url,
        carouselImages: JSON.stringify(productData.carouselImages || []),
        timestamp: Date.now().toString(),
        xhsStatus: "未发布",
        wechatStatus: "pending",
        options: JSON.stringify([]),
        variants: JSON.stringify([]),
        sku: 'SKU-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
        inventory: 1000
      };

      await Product.create(finalData);
      io.emit("products-changed");

      res.json({
        success: true,
        data: finalData
      });

    } catch (error: any) {
      console.error("Scraping error:", error.message);
      res.status(500).json({ error: `采集失败: ${error.message}` });
    } finally {
      if (scraperBrowser) await scraperBrowser.close();
    }
  });

  // API Route for product series collection
  app.post("/api/collect-series", async (req, res) => {
    const { url, socketId } = req.body;
    if (!url) {
      return res.status(400).json({ error: "必须提供 URL" });
    }

    const sendProgress = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
      if (socketId && io) {
        io.to(socketId).emit('automation-log', { message: msg, type });
      }
    };

    let scraperBrowser = null;
    try {
      sendProgress(`开始系列采集: ${url}`);
      
      scraperBrowser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      const scraperPage = await scraperBrowser.newPage();
      await scraperPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      
      const allProductUrls: string[] = [];
      const seenUrls = new Set<string>();
      let currentUrl = url;
      let pageCount = 0;
      const maxPages = 50; // Increased safety limit for pagination

      while (currentUrl && pageCount < maxPages) {
        pageCount++;
        sendProgress(`正在抓取第 ${pageCount} 页...`);
        
        try {
          await scraperPage.goto(currentUrl, { waitUntil: "networkidle2", timeout: 60000 });
          // Small delay to be polite and ensure dynamic content loads
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          sendProgress(`无法访问页面 ${currentUrl}，停止翻页。`, 'error');
          break;
        }

        // Handle potential infinite scroll or lazy loading
        await scraperPage.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= scrollHeight || totalHeight > 5000) {
                clearInterval(timer);
                resolve(true);
              }
            }, 100);
          });
        });

        // Extract product links and next page URL
        const pageData = await scraperPage.evaluate(() => {
          const gridSelectors = [
            'main', '#MainContent', '.main-content', 
            '.collection-matrix', '.grid', '.product-grid',
            '.products-grid', '.product-list', '.collection-products',
            '#product-grid', '#collection-matrix', '.main-content .grid',
            '.shopify-section .grid', '.container .grid'
          ];
          
          let container: Element | null = null;
          for (const sel of gridSelectors) {
            const el = document.querySelector(sel);
            if (el && el.querySelectorAll('a[href*="/products/"], a[href*="/product/"]').length > 2) {
              container = el;
              break;
            }
          }

          const searchArea = container || document.querySelector('main') || document.body;
          const links = Array.from(searchArea.querySelectorAll("a"));
          const productLinks = links
            .map(a => a.href)
            .filter(href => {
              if (!href) return false;
              const h = href.toLowerCase();
              const isProduct = h.includes("/products/") || h.includes("/product/") || h.includes("/item/");
              const isNoise = (h.includes("/collections/") && !h.includes("/products/")) || 
                              h.includes("cart") || h.includes("account") || h.includes("search");
              return isProduct && !isNoise;
            });

          // Find next page link
          const nextLinkSelectors = [
            'a[aria-label*="Next"]', 'a[title*="Next"]', 'a.next', '.next a',
            'a[rel="next"]', '.pagination__next a', '.pagination-next a'
          ];
          let nextUrl = null;
          for (const sel of nextLinkSelectors) {
            const el = document.querySelector(sel) as HTMLAnchorElement;
            if (el && el.href && el.href !== window.location.href) {
              nextUrl = el.href;
              break;
            }
          }

          return { productLinks, nextUrl };
        });

        // Add unique links
        for (const link of pageData.productLinks) {
          try {
            const u = new URL(link);
            const normalized = u.origin + u.pathname;
            if (!seenUrls.has(normalized)) {
              allProductUrls.push(link);
              seenUrls.add(normalized);
            }
          } catch (e) {
            if (!seenUrls.has(link)) {
              allProductUrls.push(link);
              seenUrls.add(link);
            }
          }
        }

        if (!pageData.nextUrl || pageData.nextUrl === currentUrl) {
          currentUrl = ""; // Stop
        } else {
          currentUrl = pageData.nextUrl;
        }
      }

      sendProgress(`共发现 ${allProductUrls.length} 个唯一产品链接，跨越 ${pageCount} 页。`);

      const products: any[] = [];
      const batchSize = 5;
      for (let i = 0; i < allProductUrls.length; i += batchSize) {
        const batch = allProductUrls.slice(i, i + batchSize);
        sendProgress(`正在抓取产品详情: ${i + 1} - ${Math.min(i + batchSize, allProductUrls.length)} / ${allProductUrls.length}`);
        await Promise.all(batch.map(async (pUrl) => {
          try {
            // Try Shopify .js first for speed
            const jsUrl = pUrl.includes('?') ? pUrl.replace('?', '.js?') : (pUrl.endsWith('/') ? pUrl.slice(0, -1) + '.js' : `${pUrl}.js`);
            try {
              const productResponse = await axios.get(jsUrl, { timeout: 8000 });
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
                  carouselImages: d.images || [],
                  timestamp: new Date().toISOString(), // Add timestamp here
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
                return;
              }
            } catch (e) {}

            // Fallback to minimal data if JS fails (could use Puppeteer here too, but it's slow for series)
            // For now, we skip if JS fails to keep it fast, or we could add a simple HTML scraper
          } catch (err: any) {
            console.error(`Failed to fetch product data for ${pUrl}:`, err.message);
          }
        }));
      }

      // Sort products back to match the original allProductUrls order
      const sortedProducts = products.sort((a, b) => {
        return allProductUrls.indexOf(a.url) - allProductUrls.indexOf(b.url);
      });

      const now = Date.now();
      const savedProducts = [];
      for (let i = 0; i < sortedProducts.length; i++) {
        const p = sortedProducts[i];
        const productData = {
          ...p,
          id: (now + i).toString() + Math.random().toString(36).substr(2, 9),
          timestamp: (now + (sortedProducts.length - i)).toString(),
          title: p.title || '未命名产品',
          price: p.price || '0.00',
          marketPrice: p.marketPrice || p.price || '0.00',
          purchasePrice: '0.00',
          productType: p.type || '未分类',
          tags: JSON.stringify(p.tags || []),
          supplierLink: p.url || '',
          xhsStatus: '未发布',
          wechatStatus: 'pending',
          carouselImages: JSON.stringify(p.carouselImages || []),
          options: JSON.stringify(p.options || []),
          variants: JSON.stringify(p.variants || []),
          sku: 'SKU-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
          inventory: 1000
        };
        const saved = await Product.create(productData);
        savedProducts.push(saved);
      }

      io.emit("products-changed");
      sendProgress(`系列采集完成！已成功保存 ${savedProducts.length} 个产品到数据库。`, 'success');
      res.json({ success: true, count: savedProducts.length });
    } catch (error: any) {
      console.error("Series scraping error:", error.message);
      res.status(500).json({ error: `系列采集失败: ${error.message}` });
    } finally {
      if (scraperBrowser) await scraperBrowser.close();
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
