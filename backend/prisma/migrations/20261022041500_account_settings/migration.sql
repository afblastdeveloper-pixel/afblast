-- AlterTable
ALTER TABLE `users` ADD COLUMN `full_name` VARCHAR(191) NULL,
    ADD COLUMN `telegram_username` VARCHAR(191) NULL,
    ADD COLUMN `telegram_verified_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `payout_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider_name` VARCHAR(191) NOT NULL,
    `account_number` TEXT NOT NULL,
    `account_number_last4` VARCHAR(191) NOT NULL,
    `holder_name` VARCHAR(191) NOT NULL,
    `locked_at` DATETIME(3) NULL,
    `withdraw_hold_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payout_accounts_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payout_change_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `requested_type` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `reviewed_by_id` INTEGER NULL,
    `review_note` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payout_change_requests_user_id_status_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `admin_reply` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_user_id_status_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_telegram_username_key` ON `users`(`telegram_username`);

-- AddForeignKey
ALTER TABLE `payout_accounts` ADD CONSTRAINT `payout_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payout_change_requests` ADD CONSTRAINT `payout_change_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payout_change_requests` ADD CONSTRAINT `payout_change_requests_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
