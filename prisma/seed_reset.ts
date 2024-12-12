import { PrismaClient } from "@prisma/client";

let prisma = new PrismaClient();

async function main() {
  try {
    // data
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0`;
  } catch (err) {
    console.log(err);
  }
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
