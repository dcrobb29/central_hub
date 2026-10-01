"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { Person, PersonnelRole } from "@/app/lib/personnel";

type PersonNodeData = {
  personId: string;
  name: string;
  role: string;
};

type PersonNodeType = Node<PersonNodeData, "person">;

function PersonCard({ data }: NodeProps<PersonNodeType>) {
  return (
    <article className="orgPersonCard">
      <Handle type="target" position={Position.Top} />
      <strong>{data.name}</strong>
      <span>{data.role}</span>
      <Handle type="source" position={Position.Bottom} />
    </article>
  );
}

const nodeTypes = { person: PersonCard };
const NODE_WIDTH = 220;
const UNIT_WIDTH = 280;
const LEVEL_HEIGHT = 150;

function createGraph(people: Person[], roles: PersonnelRole[]) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const rolesById = new Map(roles.map((role) => [role.id, role.name]));
  const children = new Map<string, Person[]>();
  const roots: Person[] = [];

  for (const person of people) {
    if (person.managerId && peopleById.has(person.managerId)) {
      const directReports = children.get(person.managerId) ?? [];
      directReports.push(person);
      children.set(person.managerId, directReports);
    } else {
      roots.push(person);
    }
  }

  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const directReports of children.values()) {
    directReports.sort((a, b) => a.name.localeCompare(b.name));
  }

  const visited = new Set<string>();
  const subtreeWidths = new Map<string, number>();
  function measure(person: Person, stack = new Set<string>()): number {
    if (stack.has(person.id)) return 1;
    const cached = subtreeWidths.get(person.id);
    if (cached !== undefined) return cached;
    const nextStack = new Set(stack).add(person.id);
    const reports = children.get(person.id) ?? [];
    const width = reports.length
      ? reports.reduce((sum, report) => sum + measure(report, nextStack), 0)
      : 1;
    subtreeWidths.set(person.id, width);
    return width;
  }

  const nodes: PersonNodeType[] = [];
  const edges: Edge[] = [];
  function place(person: Person, startUnit: number, depth: number, stack = new Set<string>()) {
    if (stack.has(person.id) || visited.has(person.id)) return;
    visited.add(person.id);
    const width = measure(person);
    const centerX = (startUnit + width / 2) * UNIT_WIDTH;
    nodes.push({
      id: person.id,
      type: "person",
      position: { x: centerX - NODE_WIDTH / 2, y: depth * LEVEL_HEIGHT },
      data: {
        personId: person.id,
        name: person.name,
        role: rolesById.get(person.roleId) ?? "Role not set",
      },
    });

    const nextStack = new Set(stack).add(person.id);
    let childStart = startUnit;
    for (const report of children.get(person.id) ?? []) {
      const childWidth = measure(report);
      edges.push({
        id: `${person.id}-${report.id}`,
        source: person.id,
        target: report.id,
        type: "smoothstep",
      });
      place(report, childStart, depth + 1, nextStack);
      childStart += childWidth;
    }
  }

  let rootStart = 0;
  for (const root of roots) {
    const width = measure(root);
    place(root, rootStart, 0);
    rootStart += width + 1;
  }

  for (const person of people) {
    if (!visited.has(person.id)) {
      const width = measure(person);
      place(person, rootStart, 0);
      rootStart += width + 1;
    }
  }

  return { nodes, edges };
}

export default function PersonnelChart({
  people,
  roles,
  onSelectPerson,
}: {
  people: Person[];
  roles: PersonnelRole[];
  onSelectPerson: (id: string | null) => void;
}) {
  function handleSelectPerson(personId: string) {
    onSelectPerson(personId);
  }

  function handlePaneClick() {
    onSelectPerson(null);
  }

  const { nodes, edges } = createGraph(people, roles);

  return (
    <div className="personnelChartCanvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => handleSelectPerson(node.data.personId)}
        onPaneClick={handlePaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background color="#d3d9d5" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
