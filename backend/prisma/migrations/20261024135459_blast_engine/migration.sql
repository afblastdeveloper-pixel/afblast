-- AlterTable
ALTER TABLE `blast_logs` ADD COLUMN `run_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `devices` ADD COLUMN `brutal_mode` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `category_id` INTEGER NULL,
    ADD COLUMN `disconnected_reason` TEXT NULL,
    ADD COLUMN `engine_state` VARCHAR(191) NOT NULL DEFAULT 'idle',
    ADD COLUMN `label` VARCHAR(191) NULL,
    ADD COLUMN `last_logout_at` DATETIME(3) NULL,
    ADD COLUMN `run_limit` INTEGER NULL,
    ADD COLUMN `run_started_at` DATETIME(3) NULL,
    ADD COLUMN `safe_mode` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `slot_number` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `speed_seconds` INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE `device_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `device_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `speed_seconds` INTEGER NOT NULL DEFAULT 30,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `limit` INTEGER NULL,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `success` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `earned` INTEGER NOT NULL DEFAULT 0,
    `is_simulated` BOOLEAN NOT NULL DEFAULT false,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `stop_reason` VARCHAR(191) NULL,

    INDEX `device_runs_device_id_started_at_idx`(`device_id`, `started_at`),
    INDEX `device_runs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `earnings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `device_id` INTEGER NULL,
    `run_id` INTEGER NULL,
    `campaign_id` INTEGER NULL,
    `target_id` INTEGER NULL,
    `task_id` INTEGER NULL,
    `amount` INTEGER NOT NULL,
    `is_simulated` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `earnings_user_id_is_simulated_idx`(`user_id`, `is_simulated`),
    INDEX `earnings_device_id_idx`(`device_id`),
    INDEX `earnings_run_id_idx`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_logs` ADD CONSTRAINT `blast_logs_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `device_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_runs` ADD CONSTRAINT `device_runs_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_runs` ADD CONSTRAINT `device_runs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_runs` ADD CONSTRAINT `device_runs_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `earnings` ADD CONSTRAINT `earnings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `earnings` ADD CONSTRAINT `earnings_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `earnings` ADD CONSTRAINT `earnings_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `device_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
