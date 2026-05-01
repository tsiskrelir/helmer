import { query } from '../database/connection';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

class DataRetentionService {
  async cleanupExpiredData(): Promise<void> {
    try {
      const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '30');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.info('Starting data retention cleanup', { cutoffDate });

      // Find inquiries to delete
      const inquiriesResult = await query(
        `SELECT id, exported_to_kleos_at, created_at
         FROM inquiries
         WHERE deleted_at IS NULL
         AND (
           (exported_to_kleos_at IS NOT NULL AND exported_to_kleos_at < $1)
           OR (exported_to_kleos_at IS NULL AND created_at < $1)
         )`,
        [cutoffDate]
      );

      const inquiriesToDelete = inquiriesResult.rows;
      logger.info(`Found ${inquiriesToDelete.length} inquiries to delete`);

      for (const inquiry of inquiriesToDelete) {
        await this.deleteInquiry(inquiry.id);
      }

      logger.info('Data retention cleanup completed');
    } catch (error: any) {
      logger.error('Error in data retention cleanup', error);
      throw error;
    }
  }

  private async deleteInquiry(inquiryId: string): Promise<void> {
    try {
      // Get documents to delete files
      const documentsResult = await query(
        `SELECT filepath FROM documents WHERE inquiry_id = $1`,
        [inquiryId]
      );

      // Delete physical files
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      for (const doc of documentsResult.rows) {
        try {
          const filePath = path.join(uploadDir, path.basename(doc.filepath));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info('Deleted file', { filePath });
          }
        } catch (error: any) {
          logger.error('Error deleting file', { filePath: doc.filepath, error });
        }
      }

      // Mark inquiry as deleted (soft delete)
      await query(
        `UPDATE inquiries SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [inquiryId]
      );

      logger.info('Inquiry marked as deleted', { inquiryId });
    } catch (error: any) {
      logger.error('Error deleting inquiry', { inquiryId, error });
      throw error;
    }
  }

  startScheduledCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);

    const msUntilTomorrow = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      // Run immediately
      this.cleanupExpiredData().catch((err) => {
        logger.error('Scheduled cleanup failed', err);
      });

      // Then run daily
      setInterval(() => {
        this.cleanupExpiredData().catch((err) => {
          logger.error('Scheduled cleanup failed', err);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilTomorrow);

    logger.info('Data retention scheduled cleanup started');
  }
}

export default new DataRetentionService();

