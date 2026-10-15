import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from '../entities/api-log.entity';
import { ApiLogMiddleware } from './api-log.middleware';
import { ApiBoundaryMiddleware } from '../developer-api/api-boundary.middleware';
import { ApiLogController } from './api-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiLog])],
  controllers: [ApiLogController],
  providers: [ApiLogMiddleware, ApiBoundaryMiddleware],
  exports: [TypeOrmModule],
})
export class ApiLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiLogMiddleware, ApiBoundaryMiddleware)
      .forRoutes({ path: 'api/*', method: RequestMethod.ALL });
  }
}
