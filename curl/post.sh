#!/bin/bash
curl -i -X POST "http://localhost:3000/api/todos" \
  -H "Content-Type: application/json" \
  -u test:test \
  -d '{"userId": "user123", "title": "新しいタスク", "tags": ["aaa", "bbb"], completed": false, "dueDate": "2023-12-31"}'

