import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ credentials: true, origin: true });
  // Parse cookies for 2FA pre-auth token
  const cookieParserMiddleware = (cookieParser as any).default || cookieParser;
  app.use(cookieParserMiddleware());
  // Increase limit for large Wazuh/Suricata payloads
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}
bootstrap();
