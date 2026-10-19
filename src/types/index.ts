export type UserRole = 'student' | 'instructor' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  enrolledCoursesCount?: number;
  completedMaterialsCount?: number;
}

export interface Material {
  id: string;
  title: string;
  description: string;
  category: string;
  format: 'pdf' | 'video' | 'quiz' | 'article';
  duration: string;
  instructor: string;
  progress: number; // 0 - 100
  isLocked: boolean;
  tags: string[];
  updatedAt: string;
}

export interface Course {
  id: string;
  title: string;
  code: string;
  description: string;
  instructor: string;
  totalMaterials: number;
  completedMaterials: number;
  category: string;
  bannerUrl?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}
