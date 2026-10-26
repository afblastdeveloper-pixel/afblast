-- AlterTable
ALTER TABLE `users` ADD COLUMN `hide_from_payment_channel` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `payment_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `withdrawal_id` INTEGER NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `telegram_message_id` VARCHAR(191) NULL,
    `last_error` TEXT NULL,
    `payload` JSON NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payment_notifications_status_created_at_idx`(`status`, `created_at`),
    UNIQUE INDEX `payment_notifications_withdrawal_id_event_key`(`withdrawal_id`, `event`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payment_notifications` ADD CONSTRAINT `payment_notifications_withdrawal_id_fkey` FOREIGN KEY (`withdrawal_id`) REFERENCES `withdrawals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
