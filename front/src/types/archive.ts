export type User = {
  id: number;
  name: string;
  email: string;
};
export type Archive = {
  id: number;
  user_id: number;
  title: string;
  description: string;
  visibility: 'public' | 'members';
  download_name: string;
  size: number;
  created_at: string;
  user_name: string;
};
export type Metadata = Pick<Archive, 'title' | 'description' | 'visibility' | 'download_name'>;
