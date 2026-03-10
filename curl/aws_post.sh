#!/bin/bash
curl -i -X POST "https://ud3c9fag2i.execute-api.ap-northeast-1.amazonaws.com/prod/api/todos" \
  -H "Content-Type: application/json" \
  -u test:test \
  -d '{"userId": "user123", "title": "新しいタスク", "description": "ほげほげ", "completed": false, "dueDate": "2023-12-31"}'

