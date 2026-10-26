-- AlterTable
ALTER TABLE `users` ADD COLUMN `approved_at` DATETIME(3) NULL,
    ADD COLUMN `approved_by_id` INTEGER NULL,
    ADD COLUMN `failed_login` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `locked_until` DATETIME(3) NULL,
    ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `rejection_reason` TEXT NULL,
    ADD COLUMN `staff_status` ENUM('pending', 'approved', 'rejected', 'suspended') NULL DEFAULT 'pending',
    ADD COLUMN `username` VARCHAR(191) NULL,
    MODIFY `role` ENUM('user', 'superadmin', 'adminfinance', 'developer') NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE `feature_flags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_flags_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role` ENUM('user', 'superadmin', 'adminfinance', 'developer') NOT NULL,
    `items` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `menu_configs_role_key`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `site_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `admin_name` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NULL,
    `ip_address` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',
    `details` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
