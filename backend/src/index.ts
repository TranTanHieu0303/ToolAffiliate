import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes';
import { SchedulerService } from './services/scheduler.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// API Prefix
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date() });
});

app.listen(port, async () => {
  console.log(`[Server] Backend is running at http://localhost:${port}`);
  
  try {
    // Initialize scheduler
    await SchedulerService.init();
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }
});
