
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://dtg_user:dtg_dev_password@localhost:5432/dtg'
});

async function verify() {
  const pollId = '641b4e8f-2244-47b9-bb46-a5f8ab5ba5dc';
  const K_THRESHOLD = 1; // Simulated AppConfig.MIN_K_ANONYMITY as per .env
  
  try {
    // Mimic the query in admin/polls.ts
    const questionsResult = await pool.query('SELECT id, question_text, question_type FROM survey_questions WHERE poll_id = $1 ORDER BY display_order', [pollId]);
    const questions = questionsResult.rows;

    console.log(`Verifying for Poll: ${pollId} with K_THRESHOLD=${K_THRESHOLD}`);

    for (const question of questions) {
      console.log(`\nQuestion: ${question.question_text} (${question.question_type})`);
      
      if (question.questionType === 'single_choice') {
        const optionResults = await pool.query(
          `SELECT qo.id as option_id, qo.option_text, COUNT(sr.id) as count
           FROM question_options qo
           LEFT JOIN survey_responses sr ON sr.selected_option_id = qo.id AND sr.question_id = $1
           WHERE qo.question_id = $1
           GROUP BY qo.id, qo.option_text, qo.display_order
           ORDER BY qo.display_order`,
          [question.id]
        );
        
        optionResults.rows.forEach(r => {
          const count = parseInt(r.count, 10);
          const visible = count < K_THRESHOLD && count > 0 ? '<suppressed>' : count;
          console.log(`  Option: ${r.option_text}, Count: ${count}, Visible: ${visible}`);
        });
      }
      // Add other types if necessary, but single_choice is sufficient for validation
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

verify();
