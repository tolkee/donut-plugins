export interface Ref {
  id: string;
  name: string;
}

export interface StateRef extends Ref {
  type: string;
  position: number;
}

export interface TeamRef extends Ref {
  key: string;
}

export interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  state: StateRef;
  assignee: Ref | null;
  team: TeamRef;
  labels: { nodes: Ref[] };
  project: Ref | null;
  cycle: { id: string; number: number; name: string | null } | null;
  updatedAt: string;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string } | null;
}

export interface IssueDetail extends IssueRow {
  description: string | null;
  projectMilestone: Ref | null;
  comments: { nodes: Comment[] };
  attachments: { nodes: { title: string; url: string }[] };
}

export interface Milestone extends Ref {}

export interface Project extends Ref {
  url: string;
  progress: number;
  targetDate: string | null;
  status: { name: string; type: string };
  lead: { name: string } | null;
  teams: { nodes: { id: string; key: string }[] };
  projectMilestones: { nodes: Milestone[] };
}

export interface ProjectDetail extends Project {
  description: string;
  issues: { nodes: IssueRow[] };
}

export interface User extends Ref {
  displayName: string;
  email: string;
}

export interface Label extends Ref {
  team: { id: string } | null;
}

export interface Team extends TeamRef {
  states: { nodes: StateRef[] };
}

const ISSUE_ROW = `id identifier title url priority priorityLabel
  state { id name type position }
  assignee { id name }
  team { id key name }
  labels(first: 10) { nodes { id name } }
  project { id name }
  cycle { id number name }
  updatedAt`;

const PROJECT = `id name url progress targetDate
  status { name type }
  lead { name }
  teams(first: 5) { nodes { id key } }
  projectMilestones(first: 25) { nodes { id name } }`;

export const WORKSPACE = `query Workspace {
  viewer { id name }
  teams(first: 50) { nodes { id key name states(first: 50) { nodes { id name type position } } } }
  issueLabels(first: 250) { nodes { id name team { id } } }
  users(first: 250, filter: { active: { eq: true } }) { nodes { id name displayName email } }
}`;

export interface WorkspaceData {
  viewer: Ref;
  teams: { nodes: Team[] };
  issueLabels: { nodes: Label[] };
  users: { nodes: User[] };
}

export const PROJECTS = `query Projects {
  projects(first: 100) { nodes { ${PROJECT} } }
}`;

export interface ProjectsData {
  projects: { nodes: Project[] };
}

export const PROJECT_DETAIL = `query Project($id: String!) {
  project(id: $id) { ${PROJECT} description issues(first: 100) { nodes { ${ISSUE_ROW} } } }
}`;

export interface ProjectDetailData {
  project: ProjectDetail;
}

export const SEARCH = `query Search($term: String!, $first: Int!, $filter: IssueFilter) {
  searchIssues(term: $term, first: $first, filter: $filter) { nodes { ${ISSUE_ROW} } }
}`;

export interface SearchData {
  searchIssues: { nodes: IssueRow[] };
}

export const MINE = `query Mine($filter: IssueFilter) {
  viewer { id assignedIssues(first: 100, filter: $filter) { nodes { ${ISSUE_ROW} } } }
}`;

export interface MineData {
  viewer: { id: string; assignedIssues: { nodes: IssueRow[] } };
}

export const ISSUES = `query Issues($filter: IssueFilter) {
  issues(first: 100, filter: $filter) { nodes { ${ISSUE_ROW} } }
}`;

export interface IssuesData {
  issues: { nodes: IssueRow[] };
}

export const ISSUE = `query Issue($id: String!) {
  issue(id: $id) {
    ${ISSUE_ROW}
    description
    projectMilestone { id name }
    comments(first: 50) { nodes { id body createdAt user { name } } }
    attachments(first: 20) { nodes { title url } }
  }
}`;

export interface IssueData {
  issue: IssueDetail;
}

export const ISSUE_REF = `query IssueRef($id: String!) {
  issue(id: $id) { id identifier url team { id key name } project { id name } }
}`;

export interface IssueRefData {
  issue: { id: string; identifier: string; url: string; team: TeamRef; project: Ref | null };
}

export const CREATE_ISSUE = `mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { identifier url } }
}`;

export const UPDATE_ISSUE = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { identifier url } }
}`;

export interface IssuePayload {
  success: boolean;
  issue: { identifier: string; url: string } | null;
}

export const COMMENT = `mutation Comment($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { url issue { identifier url } } }
}`;

export interface CommentPayload {
  success: boolean;
  comment: { url: string; issue: { identifier: string; url: string } | null } | null;
}

export const DOCUMENTS = { WORKSPACE, PROJECTS, PROJECT_DETAIL, SEARCH, MINE, ISSUES, ISSUE, ISSUE_REF, CREATE_ISSUE, UPDATE_ISSUE, COMMENT };
