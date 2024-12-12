-- CreateTable
CREATE TABLE `Setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settingKey` VARCHAR(191) NOT NULL,
    `settingValue` VARCHAR(191) NOT NULL,
    `parseTo` ENUM('Int', 'Float', 'BigInt', 'String') NOT NULL,

    INDEX `Setting_id_settingKey_idx`(`id`, `settingKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimeMicro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('Session', 'WorkTime') NOT NULL DEFAULT 'Session',
    `sessionId` INTEGER NULL,
    `workTimeId` INTEGER NULL,
    `start` INTEGER NOT NULL,
    `end` INTEGER NULL,

    INDEX `TimeMicro_id_type_start_end_idx`(`id`, `type`, `start`, `end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `start` VARCHAR(191) NOT NULL,
    `end` VARCHAR(191) NOT NULL,

    INDEX `Session_id_start_end_idx`(`id`, `start`, `end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkTime` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `start` VARCHAR(191) NOT NULL,
    `end` VARCHAR(191) NOT NULL,
    `sessionId` INTEGER NULL,

    INDEX `WorkTime_id_start_end_idx`(`id`, `start`, `end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    INDEX `Currency_id_name_idx`(`id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_Related` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_Related_AB_unique`(`A`, `B`),
    INDEX `_Related_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TimeMicro` ADD CONSTRAINT `TimeMicro_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeMicro` ADD CONSTRAINT `TimeMicro_workTimeId_fkey` FOREIGN KEY (`workTimeId`) REFERENCES `WorkTime`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkTime` ADD CONSTRAINT `WorkTime_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_Related` ADD CONSTRAINT `_Related_A_fkey` FOREIGN KEY (`A`) REFERENCES `Currency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_Related` ADD CONSTRAINT `_Related_B_fkey` FOREIGN KEY (`B`) REFERENCES `Currency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
