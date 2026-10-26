-- CreateTable
CREATE TABLE `password_reset_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `start_token_hash` VARCHAR(191) NOT NULL,
    `code_hash` VARCHAR(191) NULL,
    `code_sent_at` DATETIME(3) NULL,
    `code_expires_at` DATETIME(3) NULL,
    `code_attempts` INTEGER NOT NULL DEFAULT 0,
    `resend_count` INTEGER NOT NULL DEFAULT 0,
    `verified_at` DATETIME(3) NULL,
    `reset_token_hash` VARCHAR(191) NULL,
    `reset_token_expires_at` DATETIME(3) NULL,
    `used_at` DATETIME(3) NULL,
    `request_ip` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_requests_start_token_hash_key`(`start_token_hash`),
    UNIQUE INDEX `password_reset_requests_reset_token_hash_key`(`reset_token_hash`),
    INDEX `password_reset_requests_user_id_idx`(`user_id`),
    INDEX `password_reset_requests_start_token_hash_idx`(`start_token_hash`),
    INDEX `password_reset_requests_reset_token_hash_idx`(`reset_token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `password_reset_requests` ADD CONSTRAINT `password_reset_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
