import { PrismaClient } from "@prisma/client";
import { QUESTIONNAIRE_SEED } from "../lib/seed/questionnaire";

const prisma = new PrismaClient();

async function main() {
  const questionnaire = await prisma.questionnaire.upsert({
    where: { slug: QUESTIONNAIRE_SEED.slug },
    create: {
      slug: QUESTIONNAIRE_SEED.slug,
      title: QUESTIONNAIRE_SEED.title,
      description: QUESTIONNAIRE_SEED.description,
      version: QUESTIONNAIRE_SEED.version,
      status: QUESTIONNAIRE_SEED.status,
    },
    update: {
      title: QUESTIONNAIRE_SEED.title,
      description: QUESTIONNAIRE_SEED.description,
      version: QUESTIONNAIRE_SEED.version,
      status: QUESTIONNAIRE_SEED.status,
    },
  });

  await prisma.question.deleteMany({
    where: { questionnaireId: questionnaire.id },
  });

  for (const question of QUESTIONNAIRE_SEED.questions) {
    await prisma.question.create({
      data: {
        questionnaireId: questionnaire.id,
        step: question.step,
        order: question.order,
        prompt: question.prompt,
        dimension: question.dimension,
        type: question.type,
        required: question.required,
        maxValue: question.maxValue,
        options: {
          create: question.options.map((option) => ({
            label: option.label,
            value: option.value,
            order: option.order,
          })),
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
