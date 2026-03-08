curl -i -X PUT "http://localhost:3000/api/todos/117ec640-d6c4-413b-8968-71b38fa4f97b" \
  -H "Content-Type: application/json" \
  -u test:test \
  -d '{"title": "更新されたタスク", "completed": true}'
