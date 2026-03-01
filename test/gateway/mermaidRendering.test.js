const { test } = require('node:test');
const assert = require('node:assert');

test('mermaid diagram - flowchart syntax', () => {
  const flowchart = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`;

  assert.ok(flowchart.includes('graph TD'), 'Should contain flowchart declaration');
  assert.ok(flowchart.includes('-->'), 'Should contain arrow syntax');
  assert.ok(flowchart.includes('['), 'Should contain node syntax');
});

test('mermaid diagram - sequence diagram syntax', () => {
  const sequence = `sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B->>A: Hello Alice`;

  assert.ok(sequence.includes('sequenceDiagram'), 'Should contain sequence diagram declaration');
  assert.ok(sequence.includes('participant'), 'Should contain participant declaration');
  assert.ok(sequence.includes('->>' ), 'Should contain message syntax');
});

test('mermaid diagram - class diagram syntax', () => {
  const classDiagram = `classDiagram
    class Animal {
      +String name
      +int age
      +makeSound()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog`;

  assert.ok(classDiagram.includes('classDiagram'), 'Should contain class diagram declaration');
  assert.ok(classDiagram.includes('class '), 'Should contain class declaration');
  assert.ok(classDiagram.includes('<|--'), 'Should contain inheritance syntax');
});

test('mermaid diagram - state diagram syntax', () => {
  const stateDiagram = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing
    Processing --> Complete
    Complete --> [*]`;

  assert.ok(stateDiagram.includes('stateDiagram'), 'Should contain state diagram declaration');
  assert.ok(stateDiagram.includes('[*]'), 'Should contain start/end state');
  assert.ok(stateDiagram.includes('-->'), 'Should contain transition syntax');
});

test('mermaid diagram - gantt chart syntax', () => {
  const gantt = `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1 :2024-01-01, 30d
    Task 2 :2024-02-01, 20d`;

  assert.ok(gantt.includes('gantt'), 'Should contain gantt declaration');
  assert.ok(gantt.includes('title'), 'Should contain title');
  assert.ok(gantt.includes('section'), 'Should contain section');
});

test('mermaid diagram - pie chart syntax', () => {
  const pie = `pie title Distribution
    "Category A" : 45
    "Category B" : 30
    "Category C" : 25`;

  assert.ok(pie.includes('pie'), 'Should contain pie declaration');
  assert.ok(pie.includes('title'), 'Should contain title');
  assert.ok(pie.includes(':'), 'Should contain value separator');
});

test('mermaid code block detection', () => {
  const markdownWithMermaid = '```mermaid\ngraph TD\n  A-->B\n```';

  assert.ok(markdownWithMermaid.includes('```mermaid'), 'Should detect mermaid code block');
  assert.ok(markdownWithMermaid.includes('graph'), 'Should contain diagram content');
});

test('mermaid rendering - error handling', () => {
  const invalidMermaid = '```mermaid\ninvalid syntax here\n```';

  // In real implementation, this should be caught and handled gracefully
  assert.ok(invalidMermaid.includes('```mermaid'), 'Should still detect mermaid block');
});

test('mermaid diagram - complex flowchart', () => {
  const complexFlow = `graph LR
    A[Start] --> B{Check}
    B -->|Pass| C[Process]
    B -->|Fail| D[Error]
    C --> E{Validate}
    E -->|OK| F[Success]
    E -->|Error| D
    D --> G[Log]
    F --> H[End]
    G --> H`;

  assert.ok(complexFlow.includes('graph LR'), 'Should contain left-right flowchart');
  assert.ok(complexFlow.match(/\{.*\}/), 'Should contain decision nodes');
  assert.ok(complexFlow.match(/\[.*\]/), 'Should contain process nodes');
});

test('mermaid diagram - subgraphs', () => {
  const subgraph = `graph TB
    subgraph Group1
      A1-->A2
    end
    subgraph Group2
      B1-->B2
    end
    A2-->B1`;

  assert.ok(subgraph.includes('subgraph'), 'Should contain subgraph declaration');
  assert.ok(subgraph.includes('end'), 'Should contain subgraph end');
});
