import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from '../entities/api-log.entity';
import { ApiLogMiddleware } from './api-log.middleware';
import { ApiLogController } from './api-log.controller';
import { ApiBoundaryMiddleware } from '../developer-api/api-boundary.middleware';
import { User } from '../entities/user.entity';
import { ApiHistoryAdminGuard } from '../developer-api/api-history.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiLog, User])],
  controllers: [ApiLogController],
  providers: [ApiLogMiddleware, ApiBoundaryMiddleware, ApiHistoryAdminGuard],
  exports: [TypeOrmModule],
})
export class ApiLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiLogMiddleware, ApiBoundaryMiddleware)
      .forRoutes({ path: 'api/*', method: RequestMethod.ALL });
  }
}
