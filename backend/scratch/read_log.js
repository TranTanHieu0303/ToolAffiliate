const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('/home/tanhieu/.gemini/antigravity/brain/0442e2fc-b506-4fa8-8e03-53e0e885d2e4/.system_generated/logs/overview.txt');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":1646')) {
      const parsed = JSON.parse(line);
      fs.writeFileSync('/home/tanhieu/RiderProjects/ToolAffiliate/backend/scratch/upgrade_proposal.txt', parsed.content);
      console.log('Saved to upgrade_proposal.txt');
      break;
    }
  }
}

main().catch(console.error);
