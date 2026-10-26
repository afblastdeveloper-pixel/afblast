-- AlterTable
ALTER TABLE `users` ADD COLUMN `telegram_chat_id` VARCHAR(191) NULL,
    ADD COLUMN `telegram_linked_at` DATETIME(3) NULL,
    ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `telegram_link_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `request_ip` VARCHAR(191) NULL,

    UNIQUE INDEX `telegram_link_tokens_token_hash_key`(`token_hash`),
    INDEX `telegram_link_tokens_user_id_purpose_idx`(`user_id`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reset_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `event` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reset_audits_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_telegram_chat_id_key` ON `users`(`telegram_chat_id`);

-- AddForeignKey
ALTER TABLE `telegram_link_tokens` ADD CONSTRAINT `telegram_link_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reset_audits` ADD CONSTRAINT `reset_audits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
