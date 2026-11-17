import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LOCATION_QUEUE } from '../queue/queue.constants';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [BullModule.registerQueue({ name: LOCATION_QUEUE })],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
