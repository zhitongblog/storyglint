import { createHashRouter, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import Home from '../pages/Home'
import Editor from '../pages/Editor'
import Outline from '../pages/Outline'
import Characters from '../pages/Characters'
import Archive from '../pages/Archive'
import Settings from '../pages/Settings'
import Cover from '../pages/Cover'
import ProjectList from '../pages/ProjectList'
import GlobalSettings from '../pages/GlobalSettings'
import Admin from '../pages/Admin'
import About from '../pages/About'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to="/projects" replace />
      },
      {
        path: 'projects',
        element: <ProjectList />
      },
      {
        path: 'home',
        element: <Home />
      },
      {
        path: 'settings',
        element: <GlobalSettings />
      },
      {
        path: 'admin',
        element: <Admin />
      },
      {
        path: 'about',
        element: <About />
      },
      {
        path: 'project/:projectId',
        children: [
          {
            index: true,
            element: <Navigate to="editor" replace />
          },
          {
            path: 'editor',
            element: <Editor />
          },
          {
            path: 'outline',
            element: <Outline />
          },
          {
            path: 'characters',
            element: <Characters />
          },
          {
            path: 'archive',
            element: <Archive />
          },
          {
            path: 'settings',
            element: <Settings />
          },
          {
            path: 'cover',
            element: <Cover />
          }
        ]
      }
    ]
  }
])

export default router
