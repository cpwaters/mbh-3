import type { Meta, StoryObj } from '@storybook/react';
import Login from './Login';
import SignUp from './SignUp';
import { mockAuth } from './stories/mock';

const meta: Meta<typeof Login> = {
  title: 'Pages/Auth',
  component: Login,
};
export default meta;

export const SignIn: StoryObj<typeof Login> = {
  render: () => <Login auth={mockAuth} />,
};

export const Register: StoryObj<typeof SignUp> = {
  render: () => <SignUp auth={mockAuth} />,
};
