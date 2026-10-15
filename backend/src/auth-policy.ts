import { SetMetadata } from '@nestjs/common';

export const PublicEndpoint = () => SetMetadata('auth:public', true);
export const IngestEndpoint = () => SetMetadata('auth:ingest', true);
export const SelfService = () => SetMetadata('auth:self-service', true);
