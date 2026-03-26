import "dotenv/config";
import { Sequelize } from "sequelize";

async function testConnection() {
  console.log("Testing connection to Tencent Cloud Database...");
  console.log(`Host: ${process.env.DB_HOST}`);
  console.log(`Port: ${process.env.DB_PORT}`);
  console.log(`User: ${process.env.DB_USER}`);
  console.log(`Database: ${process.env.DB_NAME}`);

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

  try {
    await sequelize.authenticate();
    console.log("✅ Connection has been established successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Unable to connect to the database:");
    console.error(error);
    process.exit(1);
  }
}

testConnection();
