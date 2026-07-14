import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from '../entities/api-log.entity';
import { ApiLogMiddleware } from './api-log.middleware';
import { ApiLogController } from './api-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiLog])],
  controllers: [ApiLogController],
  providers: [ApiLogMiddleware],
  exports: [TypeOrmModule],
})
export class ApiLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiLogMiddleware)
      .forRoutes({ path: 'api/*', method: RequestMethod.ALL });
  }
}
