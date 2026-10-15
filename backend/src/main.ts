import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { requestAdmission } from './request-admission';

async function bootstrap() {


  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DATABASE_URL) throw new Error('Production requires DATABASE_URL and reviewed migrations');
    for (const key of ['INGEST_API_KEY', 'DETECTION_API_KEY']) {
      if ((process.env[key] || '').length < 32) throw new Error(key + ' requires at least 32 characters in production');
    }
  }
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.enableCors({ credentials: true, origin: true });
  // Parse cookies for 2FA pre-auth token
  const cookieParserMiddleware = (cookieParser as any).default || cookieParser;
  app.use(cookieParserMiddleware());
  app.use(requestAdmission.use);
  // Increase limit for large Wazuh/Suricata payloads
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}
bootstrap();
