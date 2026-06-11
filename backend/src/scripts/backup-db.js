const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load variables from .env file relative to this script
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionUrl = process.env.DATABASE_URL;

if (!connectionUrl) {
  console.error('Lỗi: Không tìm thấy DATABASE_URL trong file .env hoặc biến môi trường!');
  process.exit(1);
}

// Phân tích DATABASE_URL
if (!connectionUrl.startsWith('postgresql://') && !connectionUrl.startsWith('postgres://')) {
  console.error('Lỗi: DATABASE_URL phải là một PostgreSQL connection string hợp lệ!');
  process.exit(1);
}

let urlObj;
try {
  urlObj = new URL(connectionUrl);
} catch (err) {
  console.error('Lỗi: Không thể phân tích cú pháp DATABASE_URL:', err.message);
  process.exit(1);
}

const dbUser = decodeURIComponent(urlObj.username || 'postgres');
const dbPassword = decodeURIComponent(urlObj.password || '');
const dbHost = urlObj.hostname || 'localhost';
const dbPort = urlObj.port || '5432';
const dbName = decodeURIComponent(urlObj.pathname.replace(/^\//, '') || '');

if (!dbName) {
  console.error('Lỗi: Tên database không được xác định trong DATABASE_URL!');
  process.exit(1);
}

// Định vị thư mục lưu trữ backup
const backupDir = path.join(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const pad = (n) => n.toString().padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const filename = `backup_${dbName}_${timestamp}.sql`;
const backupPath = path.join(backupDir, filename);

// Tìm kiếm đường dẫn pg_dump trên Windows nếu không có trong PATH
function getPgDumpPath() {
  if (process.platform === 'win32') {
    try {
      execSync('pg_dump --version', { stdio: 'ignore' });
      return 'pg_dump';
    } catch (err) {
      // Thử tìm trong thư mục cài đặt PostgreSQL mặc định
      const baseDir = 'C:\\Program Files\\PostgreSQL';
      if (fs.existsSync(baseDir)) {
        try {
          const versions = fs.readdirSync(baseDir);
          // Sắp xếp các phiên bản từ cao xuống thấp để lấy bản mới nhất
          versions.sort((a, b) => parseFloat(b) - parseFloat(a));
          for (const ver of versions) {
            const pgDumpExe = path.join(baseDir, ver, 'bin', 'pg_dump.exe');
            if (fs.existsSync(pgDumpExe)) {
              console.log(`[INFO] Tìm thấy pg_dump.exe tại: ${pgDumpExe}`);
              return pgDumpExe;
            }
          }
        } catch (_) {}
      }
    }
  } else {
    try {
      execSync('which pg_dump', { stdio: 'ignore' });
      return 'pg_dump';
    } catch (err) {}
  }
  return null;
}

function printTroubleshootingGuide() {
  console.log('\n=========================================');
  console.log('HƯỚNG DẪN KHẮC PHỤC LỖI BACKUP DATABASE:');
  console.log('=========================================');
  console.log('1. Đảm bảo rằng PostgreSQL client tools (pg_dump) đã được cài đặt.');
  console.log('   - Trên Windows: Bạn có thể cài đặt PostgreSQL hoặc tải riêng pg_dump và thêm vào PATH.');
  console.log('   - Hoặc cài đặt mặc định tại "C:\\Program Files\\PostgreSQL".');
  console.log('2. Nếu bạn đang chạy database qua Docker Compose:');
  console.log('   - Hãy đảm bảo Docker Desktop đã được khởi động.');
  console.log('   - Chạy lệnh `docker ps` để kiểm tra container "toolaffiliate_postgres" có đang chạy không.');
  console.log('3. Kiểm tra lại chuỗi kết nối DATABASE_URL trong file backend/.env.');
  console.log('   Hiện tại đang cấu hình:');
  console.log(`   - Host: ${dbHost}`);
  console.log(`   - Port: ${dbPort}`);
  console.log(`   - User: ${dbUser}`);
  console.log(`   - Database: ${dbName}`);
  console.log('=========================================\n');
}

function tryDockerBackup() {
  console.log(`[INFO] Đang thử sao lưu qua container Docker "toolaffiliate_postgres"...`);
  
  const writeStream = fs.createWriteStream(backupPath);
  
  // Sử dụng docker exec để chạy pg_dump trực tiếp trong container
  const dockerArgs = [
    'exec',
    '-i',
    '-e', `PGPASSWORD=${dbPassword}`,
    'toolaffiliate_postgres',
    'pg_dump',
    '-h', 'localhost',
    '-U', dbUser,
    '-d', dbName
  ];
  
  const dockerProcess = spawn('docker', dockerArgs);
  dockerProcess.stdout.pipe(writeStream);
  
  let errorOutput = '';
  dockerProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });
  
  dockerProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`\n[SUCCESS] Sao lưu cơ sở dữ liệu qua Docker thành công!`);
      console.log(`[FILE] ${backupPath}`);
      process.exit(0);
    } else {
      // Xóa file lỗi rỗng
      try { fs.unlinkSync(backupPath); } catch (_) {}
      console.error(`\n[ERROR] Sao lưu qua Docker thất bại với mã lỗi ${code}:`);
      console.error(errorOutput.trim());
      printTroubleshootingGuide();
      process.exit(1);
    }
  });
  
  dockerProcess.on('error', (err) => {
    try { fs.unlinkSync(backupPath); } catch (_) {}
    console.error(`\n[ERROR] Không thể khởi chạy Docker:`, err.message);
    printTroubleshootingGuide();
    process.exit(1);
  });
}

function executeBackup() {
  const pgDumpPath = getPgDumpPath();
  
  if (!pgDumpPath) {
    console.log('[WARN] Không tìm thấy pg_dump trong hệ thống.');
    tryDockerBackup();
    return;
  }
  
  console.log(`[INFO] Đang sao lưu cơ sở dữ liệu "${dbName}" từ "${dbHost}:${dbPort}"...`);
  
  const args = [
    '-h', dbHost,
    '-p', dbPort,
    '-U', dbUser,
    '-d', dbName,
    '-f', backupPath
  ];
  
  const child = spawn(pgDumpPath, args, {
    env: {
      ...process.env,
      PGPASSWORD: dbPassword
    }
  });
  
  let errorOutput = '';
  child.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });
  
  child.on('close', (code) => {
    if (code === 0) {
      console.log(`\n[SUCCESS] Sao lưu cơ sở dữ liệu thành công!`);
      console.log(`[FILE] ${backupPath}`);
      process.exit(0);
    } else {
      console.error(`\n[ERROR] pg_dump thất bại với mã lỗi ${code}:`);
      console.error(errorOutput.trim());
      tryDockerBackup();
    }
  });
  
  child.on('error', (err) => {
    console.error(`\n[ERROR] Không thể khởi chạy pg_dump:`, err.message);
    tryDockerBackup();
  });
}

// Chạy hàm thực thi backup
executeBackup();
